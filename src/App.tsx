import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { toast, Toaster } from "sonner";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import {
  checkAccessibilityPermission,
  checkMicrophonePermission,
} from "tauri-plugin-macos-permissions-api";
import { ModelStateEvent, RecordingErrorEvent } from "./lib/types/events";
import "./App.css";
import AccessibilityPermissions from "./components/AccessibilityPermissions";
import SecureInputWarning from "./components/SecureInputWarning";
import Footer from "./components/footer";
import Onboarding, { AccessibilityOnboarding } from "./components/onboarding";
import {
  DebugSettings,
  type OnboardingPreviewStep,
} from "./components/settings";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  isSidebarSection,
  Sidebar,
  SidebarSection,
  SECTIONS_CONFIG,
} from "./components/Sidebar";
import { NAVIGATE_EVENT } from "./lib/navigation";
import { WhatsNewGate } from "./components/whats-new";
import { useSettings } from "./hooks/useSettings";
import { useSettingsStore } from "./stores/settingsStore";
import { commands } from "@/bindings";
import { getLanguageDirection, initializeRTL } from "@/lib/utils/rtl";

type OnboardingStep = "accessibility" | "model" | "done";

// Stable identity so preview effects do not re-run due to callback changes.
const NOOP = () => {};

const renderSettingsContent = (
  section: SidebarSection,
  onPreviewOnboarding: (step: OnboardingPreviewStep) => void,
) => {
  if (section === "debug") {
    return <DebugSettings onPreviewOnboarding={onPreviewOnboarding} />;
  }

  const ActiveComponent =
    SECTIONS_CONFIG[section]?.component || SECTIONS_CONFIG.speak.component;
  return <ActiveComponent />;
};

/** The first-run screens fill the window on their own, without the side
 * column: they paint the window ground themselves (the Mac window is
 * see-through, App.css) and keep a strip along the top to drag it by. */
const FirstRunFrame = ({ children }: { children: ReactNode }) => (
  <div className="app-ground min-h-screen">
    <div data-tauri-drag-region className="fixed inset-x-0 top-0 h-12 z-10" />
    {children}
  </div>
);

const SIDEBAR_COLLAPSED_KEY = "speakease.sidebar.collapsed";
const SIDEBAR_WIDTH_KEY = "speakease.sidebar.width";
/** The open side column's width, the person's to drag (ReadEase's rule). */
const SIDEBAR_DEFAULT_WIDTH = 208;
const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 320;
const clampSidebarWidth = (width: number) =>
  Number.isFinite(width)
    ? Math.round(
        Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)),
      )
    : SIDEBAR_DEFAULT_WIDTH;

function App() {
  const { t, i18n } = useTranslation();
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep | null>(
    null,
  );
  const [onboardingPreview, setOnboardingPreview] =
    useState<OnboardingPreviewStep | null>(null);
  // Track if this is a returning user who just needs to grant permissions
  // (vs a new user who needs full onboarding including model selection)
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [currentSection, setCurrentSection] = useState<SidebarSection>("speak");
  // The side panel's folded state is a per-Mac convenience, kept in
  // localStorage like the theme mirror; it survives relaunches.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  // Remembered when the hand lets go, not per move.
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      return stored === null
        ? SIDEBAR_DEFAULT_WIDTH
        : clampSidebarWidth(Number(stored));
    } catch {
      return SIDEBAR_DEFAULT_WIDTH;
    }
  });
  const resizeSidebar = useCallback((width: number | null) => {
    if (width === null) {
      setSidebarWidth((current) => {
        try {
          localStorage.setItem(SIDEBAR_WIDTH_KEY, String(current));
        } catch {
          // private storage: the width just isn't remembered
        }
        return current;
      });
      return;
    }
    setSidebarWidth(clampSidebarWidth(width));
  }, []);
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((collapsed) => {
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "0" : "1");
      } catch {
        // private storage: the fold just isn't remembered
      }
      return !collapsed;
    });
  }, []);
  const { settings, updateSetting } = useSettings();
  const direction = getLanguageDirection(i18n.language);
  const refreshAudioDevices = useSettingsStore(
    (state) => state.refreshAudioDevices,
  );
  const refreshOutputDevices = useSettingsStore(
    (state) => state.refreshOutputDevices,
  );
  const hasCompletedPostOnboardingInit = useRef(false);
  const settingsScrollRef = useRef<HTMLDivElement>(null);
  const isShowingOnboarding =
    onboardingPreview !== null ||
    onboardingStep === "accessibility" ||
    onboardingStep === "model";

  // Classic scrollbars consume layout space. Reserve a matching gutter on the
  // opposite edge while onboarding is visible so its content stays centered in
  // the physical window. Overlay scrollbars ignore scrollbar-gutter.
  useLayoutEffect(() => {
    const attribute = "data-onboarding-active";
    document.documentElement.toggleAttribute(attribute, isShowingOnboarding);
    return () => document.documentElement.removeAttribute(attribute);
  }, [isShowingOnboarding]);

  // Reset the scroll position whenever the active section changes.
  useLayoutEffect(() => {
    settingsScrollRef.current?.scrollTo({ top: 0 });
  }, [currentSection]);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  // Initialize RTL direction when language changes
  useEffect(() => {
    initializeRTL(i18n.language);
  }, [i18n.language]);

  // Initialize Enigo, shortcuts, and refresh audio devices when main app loads
  useEffect(() => {
    if (onboardingStep === "done" && !hasCompletedPostOnboardingInit.current) {
      hasCompletedPostOnboardingInit.current = true;
      Promise.all([
        commands.initializeEnigo(),
        commands.initializeShortcuts(),
      ]).catch((e) => {
        console.warn("Failed to initialize:", e);
      });
      refreshAudioDevices();
      refreshOutputDevices();
    }
  }, [onboardingStep, refreshAudioDevices, refreshOutputDevices]);

  // Open a section when a page asks (the Speak page's "More settings"
  // links) or the tray does ("Open History").
  useEffect(() => {
    const open = (section: unknown) => {
      if (isSidebarSection(section)) setCurrentSection(section);
    };
    const onPage = (event: Event) => open((event as CustomEvent).detail);
    window.addEventListener(NAVIGATE_EVENT, onPage);
    const unlisten = listen<string>(NAVIGATE_EVENT, (event) =>
      open(event.payload),
    );
    return () => {
      window.removeEventListener(NAVIGATE_EVENT, onPage);
      unlisten.then((fn) => fn());
    };
  }, []);

  // Handle keyboard shortcuts for debug mode toggle
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+D (Windows/Linux) or Cmd+Shift+D (macOS)
      const isDebugShortcut =
        event.shiftKey &&
        event.key.toLowerCase() === "d" &&
        (event.ctrlKey || event.metaKey);

      if (isDebugShortcut) {
        event.preventDefault();
        const currentDebugMode = settings?.debug_mode ?? false;
        updateSetting("debug_mode", !currentDebugMode);
      }
    };

    // Add event listener when component mounts
    document.addEventListener("keydown", handleKeyDown);

    // Cleanup event listener when component unmounts
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settings?.debug_mode, updateSetting]);

  // Listen for recording errors from the backend and show a toast
  useEffect(() => {
    const unlisten = listen<RecordingErrorEvent>("recording-error", (event) => {
      const { error_type, detail } = event.payload;

      if (error_type === "microphone_permission_denied") {
        const currentPlatform = platform();
        const platformKey = `errors.micPermissionDenied.${currentPlatform}`;
        const description = t(platformKey, {
          defaultValue: t("errors.micPermissionDenied.generic"),
        });
        toast.error(t("errors.micPermissionDeniedTitle"), { description });
      } else if (error_type === "no_input_device") {
        toast.error(t("errors.noInputDeviceTitle"), {
          description: t("errors.noInputDevice"),
        });
      } else {
        toast.error(
          t("errors.recordingFailed", { error: detail ?? "Unknown error" }),
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for paste failures and show a toast.
  // The technical error detail is logged to handy.log on the Rust side
  // (see actions.rs `error!("Failed to paste transcription: ...")`),
  // so we show a localized, user-friendly message here instead of the raw error.
  useEffect(() => {
    const unlisten = listen("paste-error", () => {
      toast.error(t("errors.pasteFailedTitle"), {
        description: t("errors.pasteFailed"),
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for transcription failures and show a toast.
  // The payload is the backend error message (also logged to handy.log).
  useEffect(() => {
    // SpeakEase: what went wrong in words a person can act on; the engine's
    // own message stays in handy.log and backs up anything not recognised.
    const unlisten = listen<string>("transcription-error", (event) => {
      const detail = event.payload ?? "";
      const known = /repeat/i.test(detail)
        ? "repetition"
        : /not loaded|no model/i.test(detail)
          ? "noModel"
          : null;
      toast.error(
        known
          ? t(`errors.transcription.${known}.title`)
          : t("errors.transcriptionFailedTitle"),
        {
          description: known
            ? t(`errors.transcription.${known}.description`)
            : detail,
          action:
            known === "noModel"
              ? {
                  label: t("errors.transcription.noModel.action"),
                  onClick: () => setCurrentSection("recognition"),
                }
              : undefined,
        },
      );
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // SpeakEase: an AI step was asked for but gave nothing back, so what was
  // said went out as it is (actions.rs notify_ai_step_skipped).
  useEffect(() => {
    const unlisten = listen("ai-step-skipped", () => {
      toast(t("errors.aiSkipped.title"), {
        description: t("errors.aiSkipped.description"),
        action: {
          label: t("errors.aiSkipped.action"),
          onClick: () => setCurrentSection("postprocessing"),
        },
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  // Listen for model loading failures and show a toast
  useEffect(() => {
    const unlisten = listen<ModelStateEvent>("model-state-changed", (event) => {
      if (event.payload.event_type === "loading_failed") {
        toast.error(
          t("errors.modelLoadFailed", {
            model:
              event.payload.model_name || t("errors.modelLoadFailedUnknown"),
          }),
          {
            description: event.payload.error,
          },
        );
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [t]);

  const revealMainWindowForPermissions = async () => {
    try {
      await commands.showMainWindowCommand();
    } catch (e) {
      console.warn("Failed to show main window for permission onboarding:", e);
    }
  };

  const checkOnboardingStatus = async () => {
    try {
      const settingsResult = await commands.getAppSettings();
      const hasCompletedOnboarding =
        settingsResult.status === "ok" &&
        settingsResult.data.onboarding_completed === true;
      const currentPlatform = platform();

      if (hasCompletedOnboarding) {
        // Returning user - check if they need to grant permissions first
        setIsReturningUser(true);

        if (currentPlatform === "macos") {
          try {
            const [hasAccessibility, hasMicrophone] = await Promise.all([
              checkAccessibilityPermission(),
              checkMicrophonePermission(),
            ]);
            if (!hasAccessibility || !hasMicrophone) {
              await revealMainWindowForPermissions();
              setOnboardingStep("accessibility");
              return;
            }
          } catch (e) {
            console.warn("Failed to check macOS permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        if (currentPlatform === "windows") {
          try {
            const microphoneStatus =
              await commands.getWindowsMicrophonePermissionStatus();
            if (
              microphoneStatus.supported &&
              microphoneStatus.overall_access === "denied"
            ) {
              await revealMainWindowForPermissions();
              setOnboardingStep("accessibility");
              return;
            }
          } catch (e) {
            console.warn("Failed to check Windows microphone permissions:", e);
            // If we can't check, proceed to main app and let them fix it there
          }
        }

        setOnboardingStep("done");
      } else {
        // New user - start full onboarding
        setIsReturningUser(false);
        setOnboardingStep("accessibility");
      }
    } catch (error) {
      console.error("Failed to check onboarding status:", error);
      setOnboardingStep("accessibility");
    }
  };

  // Stable across renders: AccessibilityOnboarding re-runs its permission
  // check (and initialize_enigo/initialize_shortcuts) whenever this changes,
  // so a fresh function per render looped those calls until the step ended.
  const handleAccessibilityComplete = useCallback(() => {
    // Returning users already have models, skip to main app
    // New users need to select a model
    setOnboardingStep(isReturningUser ? "done" : "model");
  }, [isReturningUser]);

  const handleModelSelected = () => {
    // Transition to main app - user has started a download
    setOnboardingStep("done");
  };

  // Rendered once around every step below (including onboarding) so
  // toast.error() calls surface to the user. sonner renders via a portal, so
  // its position in the tree doesn't affect layout. Without this, errors during
  // onboarding (e.g. a model download failing because blob.handy.computer is
  // unreachable) are silently swallowed and the wizard just appears to "blink".
  const toaster = (
    <Toaster
      theme="system"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "bg-background border border-mid-gray/20 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 text-sm",
          title: "font-medium",
          description: "text-mid-gray",
          actionButton:
            "px-2 py-1 text-xs font-medium rounded-lg border bg-mid-gray/10 border-mid-gray/20 hover:bg-background-ui/30 hover:border-logo-primary cursor-pointer whitespace-nowrap",
        },
      }}
    />
  );

  // Still checking onboarding status
  if (onboardingStep === null) {
    return null;
  }

  // Select the content for the current step. The Toaster is rendered once, in a
  // stable wrapper around this node, so crossing between onboarding steps and
  // the main app never remounts it (which would drop any in-flight toast).
  let content: ReactNode;
  if (onboardingPreview) {
    // Render previews in the same top-level slot as real onboarding. Keeping
    // the settings layout unmounted ensures viewport overflow behaves exactly
    // as it does during first-run onboarding.
    content = (
      <FirstRunFrame>
        {onboardingPreview === "accessibility" ? (
          <AccessibilityOnboarding onComplete={NOOP} preview />
        ) : (
          <Onboarding onModelSelected={NOOP} preview />
        )}
        <button
          type="button"
          onClick={() => setOnboardingPreview(null)}
          className="fixed top-4 end-4 z-50 rounded-lg border border-mid-gray/20 bg-background px-4 py-2 text-sm font-medium text-text shadow-lg hover:bg-background-ui/30 cursor-pointer"
        >
          {t("settings.debug.onboardingPreview.exitButton")}
        </button>
      </FirstRunFrame>
    );
  } else if (onboardingStep === "accessibility") {
    content = (
      <FirstRunFrame>
        <AccessibilityOnboarding onComplete={handleAccessibilityComplete} />
      </FirstRunFrame>
    );
  } else if (onboardingStep === "model") {
    content = (
      <FirstRunFrame>
        <Onboarding onModelSelected={handleModelSelected} />
      </FirstRunFrame>
    );
  } else {
    content = (
      <div dir={direction} className="h-screen flex select-none cursor-default">
        <ErrorBoundary context="What's New">
          <WhatsNewGate />
        </ErrorBoundary>
        {/* The side column, flush with the window's left edge (ReadEase's
            layout): the Mac's sidebar material shows through it. */}
        <Sidebar
          activeSection={currentSection}
          onSectionChange={setCurrentSection}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          width={sidebarWidth}
          onResize={resizeSidebar}
        />
        <div className="app-ground flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* The toolbar: the window's drag handle (the title bar is an
              overlay) and the page's name, on the window buttons' line. */}
          <header
            data-tauri-drag-region
            className="h-[60px] shrink-0 flex items-center px-6 border-b border-hairline"
          >
            <h1
              data-tauri-drag-region
              className="font-display text-[15px] font-semibold truncate"
            >
              {t(SECTIONS_CONFIG[currentSection].labelKey)}
            </h1>
          </header>
          <div ref={settingsScrollRef} className="flex-1 overflow-y-auto">
            <div className="flex flex-col items-center p-4 gap-4">
              <AccessibilityPermissions />
              <SecureInputWarning />
              {renderSettingsContent(currentSection, setOnboardingPreview)}
            </div>
          </div>
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <>
      {toaster}
      {content}
    </>
  );
}

export default App;
