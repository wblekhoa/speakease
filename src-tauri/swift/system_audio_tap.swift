// SpeakEase: hears one app's sound through a Core Audio process tap
// (macOS 14.2+), for live subtitles. The sequence — tap description, private
// aggregate device holding the tap, IO proc on the aggregate — follows
// AudioCap by Guilherme Rambo (BSD-2-Clause, github.com/insidegui/AudioCap).
//
// C ABI (see system_audio_tap.rs):
//   se_tap_available()                       1 when process taps exist
//   se_tap_list_processes()                  JSON of processes Core Audio knows
//   se_tap_start(bundle, mute, cb, ctx, &err) handle > 0, or 0 with *err set;
//                                            mute silences the app while tapped
//   se_tap_stop(handle)
//   se_tap_free_string(ptr)                  frees strings returned above

import AppKit
import AudioToolbox
import CoreAudio
import Foundation

public typealias SETapCallback = @convention(c) (
    UnsafeMutableRawPointer?, UnsafePointer<Float>?, UInt32, Double
) -> Void

private func readProperty<T>(
    _ object: AudioObjectID, _ selector: AudioObjectPropertySelector, _ fallback: T,
    qualifier: UnsafeRawPointer? = nil, qualifierSize: UInt32 = 0
) -> T? {
    var address = AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var size = UInt32(MemoryLayout<T>.size)
    var value = fallback
    let err = withUnsafeMutablePointer(to: &value) {
        AudioObjectGetPropertyData(object, &address, qualifierSize, qualifier, &size, $0)
    }
    return err == noErr ? value : nil
}

private func readString(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector)
    -> String?
{
    guard let value: CFString = readProperty(object, selector, "" as CFString) else {
        return nil
    }
    let string = value as String
    return string.isEmpty ? nil : string
}

private func processObjects() -> [AudioObjectID] {
    var address = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyProcessObjectList,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    let system = AudioObjectID(kAudioObjectSystemObject)
    guard AudioObjectGetPropertyDataSize(system, &address, 0, nil, &size) == noErr else {
        return []
    }
    var ids = [AudioObjectID](
        repeating: kAudioObjectUnknown, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(system, &address, 0, nil, &size, &ids) == noErr else {
        return []
    }
    return ids
}

private struct TapProcess {
    let object: AudioObjectID
    let pid: pid_t
    let bundleID: String?
    /// The app responsible for the process: a browser's or a WebKit app's
    /// sound plays in helpers (`com.google.Chrome.helper`,
    /// `com.apple.WebKit.GPU`) whose own bundle id may not name the app.
    let responsiblePID: pid_t
    let appBundleID: String?
    let playing: Bool
}

/// `responsibility_get_pid_responsible_for_pid` (libSystem, not in the SDK
/// headers): the process macOS holds responsible for `pid` — the host app of
/// an XPC helper. Missing, it answers `pid` itself.
private let responsibleFor: (pid_t) -> pid_t = {
    typealias Lookup = @convention(c) (pid_t) -> pid_t
    guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_get_pid_responsible_for_pid")
    else { return { $0 } }
    let lookup = unsafeBitCast(symbol, to: Lookup.self)
    return { pid in
        let responsible = lookup(pid)
        return responsible > 0 ? responsible : pid
    }
}()

private func tapProcesses() -> [TapProcess] {
    processObjects().map { object in
        let pid = readProperty(object, kAudioProcessPropertyPID, pid_t(-1)) ?? -1
        let responsible = pid > 0 ? responsibleFor(pid) : pid
        return TapProcess(
            object: object,
            pid: pid,
            bundleID: readString(object, kAudioProcessPropertyBundleID),
            responsiblePID: responsible,
            appBundleID: NSRunningApplication(processIdentifier: responsible)?.bundleIdentifier,
            playing: (readProperty(object, kAudioProcessPropertyIsRunningOutput, UInt32(0)) ?? 0)
                != 0)
    }
}

/// Every process that plays for `app`: its own, helpers whose bundle id
/// extends it, and helpers it is responsible for.
private func belongsToApp(_ process: TapProcess, _ app: String) -> Bool {
    if process.appBundleID == app { return true }
    guard let bundleID = process.bundleID else { return false }
    return bundleID == app || bundleID.hasPrefix(app + ".")
}

private func cString(_ string: String) -> UnsafeMutablePointer<CChar>? {
    strdup(string)
}

private final class ActiveTap {
    var tapID = AudioObjectID(kAudioObjectUnknown)
    var aggregateID = AudioObjectID(kAudioObjectUnknown)
    var procID: AudioDeviceIOProcID?
    let queue = DispatchQueue(label: "speakease.system-audio-tap", qos: .userInitiated)

    func stop() {
        if aggregateID != kAudioObjectUnknown {
            AudioDeviceStop(aggregateID, procID)
            if let procID { AudioDeviceDestroyIOProcID(aggregateID, procID) }
            AudioHardwareDestroyAggregateDevice(aggregateID)
            aggregateID = AudioObjectID(kAudioObjectUnknown)
            procID = nil
        }
        if tapID != kAudioObjectUnknown {
            if #available(macOS 14.2, *) { AudioHardwareDestroyProcessTap(tapID) }
            tapID = AudioObjectID(kAudioObjectUnknown)
        }
    }
}

private let tapsLock = NSLock()
private var taps: [Int64: ActiveTap] = [:]
private var nextHandle: Int64 = 1

@_cdecl("se_tap_available")
public func se_tap_available() -> Int32 {
    if #available(macOS 14.2, *) { return 1 }
    return 0
}

@_cdecl("se_tap_free_string")
public func se_tap_free_string(_ pointer: UnsafeMutablePointer<CChar>?) {
    free(pointer)
}

@_cdecl("se_tap_list_processes")
public func se_tap_list_processes() -> UnsafeMutablePointer<CChar>? {
    let own = ProcessInfo.processInfo.processIdentifier
    let rows: [[String: Any]] = tapProcesses()
        .filter { $0.pid != own && $0.responsiblePID != own }
        .map {
            [
                "pid": Int($0.pid), "bundle_id": $0.bundleID ?? "",
                "app_bundle_id": $0.appBundleID ?? "", "playing": $0.playing,
            ]
        }
    guard let data = try? JSONSerialization.data(withJSONObject: rows),
        let json = String(data: data, encoding: .utf8)
    else { return cString("[]") }
    return cString(json)
}

@_cdecl("se_tap_start")
public func se_tap_start(
    _ bundle: UnsafePointer<CChar>?, _ mute: Int32, _ callback: SETapCallback?,
    _ context: UnsafeMutableRawPointer?,
    _ errorOut: UnsafeMutablePointer<UnsafeMutablePointer<CChar>?>?
) -> Int64 {
    func fail(_ message: String) -> Int64 {
        errorOut?.pointee = cString(message)
        return 0
    }
    guard #available(macOS 14.2, *) else { return fail("unsupported: needs macOS 14.2") }
    guard let bundle, let callback else { return fail("bad arguments") }
    let app = String(cString: bundle)
    let own = ProcessInfo.processInfo.processIdentifier
    // A number is a process id: command-line tools such as afplay have no
    // bundle id (used by the probe's quiet test).
    let pid = pid_t(app)
    let objects = tapProcesses()
        .filter { process in
            guard process.pid != own, process.responsiblePID != own else { return false }
            if let pid { return process.pid == pid }
            return belongsToApp(process, app)
        }
        .map(\.object)
    if objects.isEmpty { return fail("no-process: \(app) has no audio process") }

    let active = ActiveTap()
    let description = CATapDescription(stereoMixdownOfProcesses: objects)
    description.uuid = UUID()
    description.muteBehavior =
        mute != 0 ? CATapMuteBehavior.mutedWhenTapped : CATapMuteBehavior.unmuted
    description.isPrivate = true
    var err = AudioHardwareCreateProcessTap(description, &active.tapID)
    guard err == noErr else { return fail("tap: AudioHardwareCreateProcessTap \(err)") }

    guard
        let format: AudioStreamBasicDescription = readProperty(
            active.tapID, kAudioTapPropertyFormat, AudioStreamBasicDescription())
    else {
        active.stop()
        return fail("tap: cannot read the tap format")
    }

    let system = AudioObjectID(kAudioObjectSystemObject)
    guard
        let output: AudioDeviceID = readProperty(
            system, kAudioHardwarePropertyDefaultSystemOutputDevice,
            AudioDeviceID(kAudioObjectUnknown)),
        let outputUID = readString(output, kAudioDevicePropertyDeviceUID)
    else {
        active.stop()
        return fail("tap: no default output device")
    }

    let aggregate: [String: Any] = [
        kAudioAggregateDeviceNameKey: "SpeakEase subtitles",
        kAudioAggregateDeviceUIDKey: UUID().uuidString,
        kAudioAggregateDeviceMainSubDeviceKey: outputUID,
        kAudioAggregateDeviceIsPrivateKey: true,
        kAudioAggregateDeviceIsStackedKey: false,
        kAudioAggregateDeviceTapAutoStartKey: true,
        kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: outputUID]],
        kAudioAggregateDeviceTapListKey: [
            [
                kAudioSubTapDriftCompensationKey: true,
                kAudioSubTapUIDKey: description.uuid.uuidString,
            ]
        ],
    ]
    err = AudioHardwareCreateAggregateDevice(aggregate as CFDictionary, &active.aggregateID)
    guard err == noErr else {
        active.stop()
        return fail("tap: AudioHardwareCreateAggregateDevice \(err)")
    }

    let isFloat = format.mFormatFlags & kAudioFormatFlagIsFloat != 0
    let nonInterleaved = format.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0
    let channels = Int(max(format.mChannelsPerFrame, 1))
    let rate = format.mSampleRate
    guard isFloat, format.mBitsPerChannel == 32 else {
        active.stop()
        return fail("tap: unexpected format \(format.mFormatFlags)/\(format.mBitsPerChannel)")
    }

    var mono: [Float] = []
    err = AudioDeviceCreateIOProcIDWithBlock(&active.procID, active.aggregateID, active.queue) {
        _, input, _, _, _ in
        let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: input))
        guard let first = buffers.first, let firstData = first.mData else { return }
        let frames: Int
        if nonInterleaved {
            frames = Int(first.mDataByteSize) / MemoryLayout<Float>.size
        } else {
            frames = Int(first.mDataByteSize) / (MemoryLayout<Float>.size * channels)
        }
        if frames == 0 { return }
        if mono.count < frames { mono = [Float](repeating: 0, count: frames) }
        if nonInterleaved {
            let count = Float(buffers.count)
            for i in 0..<frames { mono[i] = 0 }
            for buffer in buffers {
                guard let data = buffer.mData?.assumingMemoryBound(to: Float.self) else {
                    continue
                }
                for i in 0..<frames { mono[i] += data[i] / count }
            }
        } else {
            let data = firstData.assumingMemoryBound(to: Float.self)
            for i in 0..<frames {
                var sum: Float = 0
                for c in 0..<channels { sum += data[i * channels + c] }
                mono[i] = sum / Float(channels)
            }
        }
        mono.withUnsafeBufferPointer { callback(context, $0.baseAddress, UInt32(frames), rate) }
    }
    guard err == noErr else {
        active.stop()
        return fail("tap: AudioDeviceCreateIOProcIDWithBlock \(err)")
    }
    err = AudioDeviceStart(active.aggregateID, active.procID)
    guard err == noErr else {
        active.stop()
        return fail("tap: AudioDeviceStart \(err)")
    }

    tapsLock.lock()
    let handle = nextHandle
    nextHandle += 1
    taps[handle] = active
    tapsLock.unlock()
    return handle
}

@_cdecl("se_tap_stop")
public func se_tap_stop(_ handle: Int64) {
    tapsLock.lock()
    let active = taps.removeValue(forKey: handle)
    tapsLock.unlock()
    active?.stop()
}
