import React, { Suspense, useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import App from "./App.jsx";
import AuthenticationStep from "./components/AuthenticationStep.tsx";
import WindowControls from "./components/WindowControls.tsx";
import { Card, CardContent } from "./components/ui/card.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { ToastProvider } from "./components/ui/Toast.tsx";
import { SettingsProvider } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useAuth } from "./hooks/useAuth";
import i18n from "./i18n";
import "./index.css";

const controlPanelImport = () => import("./components/ControlPanel.tsx");
const onboardingFlowImport = () => import("./components/OnboardingFlow.tsx");
const ControlPanel = React.lazy(controlPanelImport);
const OnboardingFlow = React.lazy(onboardingFlowImport);

let root = null;

const VALID_CHANNELS = new Set(["development", "staging", "production"]);
const DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL = {
  development: "flowrytr-dev",
  staging: "flowrytr-staging",
  production: "flowrytr",
};
const inferredChannel = import.meta.env.DEV ? "development" : "production";
const configuredChannel = (
  import.meta.env.VITE_FLOWRYTR_CHANNEL ||
  import.meta.env.VITE_OPENWHISPR_CHANNEL ||
  inferredChannel
)
  .trim()
  .toLowerCase();
const APP_CHANNEL = VALID_CHANNELS.has(configuredChannel) ? configuredChannel : inferredChannel;
const defaultOAuthProtocol =
  DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL[APP_CHANNEL] || DEFAULT_OAUTH_PROTOCOL_BY_CHANNEL.production;
const OAUTH_PROTOCOL = (
  import.meta.env.VITE_FLOWRYTR_PROTOCOL ||
  import.meta.env.VITE_OPENWHISPR_PROTOCOL ||
  defaultOAuthProtocol
)
  .trim()
  .toLowerCase();

// Auth callback handler: when the browser redirects back from Clerk
// with a session token via custom protocol, redirect to the Electron app.
// This check runs before React mounts — if we detect we're in the system
// browser with a token param, we redirect immediately.
function isAuthBrowserRedirect() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const isInElectron = typeof window.electronAPI !== "undefined";

  if (token && !isInElectron) {
    const redirectTitle = i18n.t("app.oauth.redirectTitle");
    const closeTab = i18n.t("app.oauth.closeTab");

    setTimeout(() => {
      const redirectUrl = new URL(`${OAUTH_PROTOCOL}://auth/callback`);
      for (const [key, value] of params.entries()) {
        redirectUrl.searchParams.set(key, value);
      }
      window.location.href = redirectUrl.toString();
    }, 2000);

    // Render a branded redirect message using safe DOM methods
    const container = document.createElement("div");
    container.id = "oauth-container";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    container.style.cssText =
      "display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;font-family:'Noto Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

    const card = document.createElement("div");
    card.style.cssText =
      "display:flex;flex-direction:column;align-items:center;gap:16px;padding:32px 40px;background:var(--surface-2,#fff);border:1px solid var(--border,#e5e5e5);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);";

    // Logo SVG
    const logoNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(logoNS, "svg");
    svg.setAttribute("viewBox", "0 0 1024 1024");
    svg.setAttribute("width", "64");
    svg.setAttribute("height", "64");
    svg.setAttribute("aria-label", "flowrytr");
    const rect = document.createElementNS(logoNS, "rect");
    rect.setAttribute("width", "1024");
    rect.setAttribute("height", "1024");
    rect.setAttribute("rx", "241");
    rect.setAttribute("fill", "#2056DF");
    const circle = document.createElementNS(logoNS, "circle");
    circle.setAttribute("cx", "512");
    circle.setAttribute("cy", "512");
    circle.setAttribute("r", "314");
    circle.setAttribute("fill", "#2056DF");
    circle.setAttribute("stroke", "white");
    circle.setAttribute("stroke-width", "74");
    svg.appendChild(rect);
    svg.appendChild(circle);
    [["M512 383V641"], ["M627 457V568"], ["M397 457V568"]].forEach(([d]) => {
      const p = document.createElementNS(logoNS, "path");
      p.setAttribute("d", d);
      p.setAttribute("stroke", "white");
      p.setAttribute("stroke-width", "74");
      p.setAttribute("stroke-linecap", "round");
      svg.appendChild(p);
    });
    card.appendChild(svg);

    // Spinner
    const spinner = document.createElement("div");
    spinner.style.cssText =
      "width:28px;height:28px;border:2.5px solid transparent;border-top-color:#2563eb;border-radius:50%;animation:spinner-rotate 0.8s cubic-bezier(0.4,0,0.2,1) infinite;";
    card.appendChild(spinner);

    // Text
    const content = document.createElement("div");
    content.style.cssText = "text-align:center;line-height:1.4;";
    const h1 = document.createElement("h1");
    h1.style.cssText = "font-size:15px;font-weight:600;margin-bottom:2px;";
    h1.textContent = redirectTitle;
    const sub = document.createElement("p");
    sub.style.cssText = "font-size:13px;font-weight:500;opacity:0.6;";
    sub.textContent = closeTab;
    content.appendChild(h1);
    content.appendChild(sub);
    card.appendChild(content);

    container.appendChild(card);

    // Add spinner animation keyframes
    const style = document.createElement("style");
    style.textContent =
      "@keyframes spinner-rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
    document.body.appendChild(container);

    return true;
  }
  return false;
}

if (!isAuthBrowserRedirect()) {
  mountApp();
}

function AppRouter() {
  useTheme();
  const { isSignedIn, isLoaded: authLoaded } = useAuth();

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isControlPanel =
    window.location.pathname.includes("control") || window.location.search.includes("panel=true");
  const isDictationPanel = !isControlPanel;

  // Preload lazy chunks while waiting for auth so Suspense resolves instantly
  useEffect(() => {
    if (isControlPanel) {
      controlPanelImport().catch(() => {});
      if (!localStorage.getItem("onboardingCompleted")) {
        onboardingFlowImport().catch(() => {});
      }
    }
  }, [isControlPanel]);

  useEffect(() => {
    if (!authLoaded) return;

    const onboardingCompleted = localStorage.getItem("onboardingCompleted") === "true";
    const authSkipped =
      localStorage.getItem("authenticationSkipped") === "true" ||
      localStorage.getItem("skipAuth") === "true";

    // Valid session proves prior onboarding — restore flag if localStorage was wiped
    if (!onboardingCompleted && isSignedIn) {
      localStorage.setItem("onboardingCompleted", "true");
    }

    const resolved = localStorage.getItem("onboardingCompleted") === "true";

    if (isControlPanel) {
      if (!resolved) {
        setShowOnboarding(true);
      } else if (!isSignedIn && !authSkipped) {
        setNeedsReauth(true);
      }
    }

    if (isDictationPanel && !resolved) {
      const rawStep = parseInt(localStorage.getItem("onboardingCurrentStep") || "0");
      const currentStep = Math.max(0, Math.min(rawStep, 5));
      if (currentStep < 4) {
        window.electronAPI?.hideWindow?.();
      }
    }

    setIsLoading(false);
  }, [isControlPanel, isDictationPanel, isSignedIn, authLoaded]);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    localStorage.setItem("onboardingCompleted", "true");
  };

  if (isLoading) {
    return <LoadingFallback />;
  }

  // First-time user: full onboarding wizard
  if (isControlPanel && showOnboarding) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </Suspense>
    );
  }

  // Returning user needs to re-authenticate (signed out, setup already done)
  if (isControlPanel && needsReauth) {
    return (
      <div
        className="h-screen flex flex-col bg-background"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div
          className="flex items-center justify-end w-full h-10 shrink-0"
          style={{ WebkitAppRegion: "drag" }}
        >
          {window.electronAPI?.getPlatform?.() !== "darwin" && (
            <div className="pr-1" style={{ WebkitAppRegion: "no-drag" }}>
              <WindowControls />
            </div>
          )}
        </div>
        <div className="flex-1 px-6 overflow-y-auto flex items-center">
          <div className="w-full max-w-sm mx-auto">
            <Card className="bg-card/90 backdrop-blur-2xl border border-border/50 dark:border-white/5 shadow-lg rounded-xl overflow-hidden">
              <CardContent className="p-6">
                <AuthenticationStep
                  onContinueWithoutAccount={() => {
                    localStorage.setItem("authenticationSkipped", "true");
                    localStorage.setItem("skipAuth", "true");
                    setNeedsReauth(false);
                  }}
                  onAuthComplete={() => setNeedsReauth(false)}
                  onNeedsVerification={() => {}}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return isControlPanel ? (
    <Suspense fallback={<LoadingFallback />}>
      <ControlPanel />
    </Suspense>
  ) : (
    <App />
  );
}

function LoadingFallback({ message }) {
  const { t } = useTranslation();
  const fallbackMessage = message || t("common.loading");

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 animate-[scale-in_300ms_ease-out]">
        <svg
          viewBox="0 0 1024 1024"
          className="w-12 h-12 drop-shadow-[0_2px_8px_rgba(37,99,235,0.18)] dark:drop-shadow-[0_2px_12px_rgba(100,149,237,0.25)]"
          aria-label="flowrytr"
        >
          <rect width="1024" height="1024" rx="241" fill="#2056DF" />
          <circle cx="512" cy="512" r="314" fill="#2056DF" stroke="white" strokeWidth="74" />
          <path d="M512 383V641" stroke="white" strokeWidth="74" strokeLinecap="round" />
          <path d="M627 457V568" stroke="white" strokeWidth="74" strokeLinecap="round" />
          <path d="M397 457V568" stroke="white" strokeWidth="74" strokeLinecap="round" />
        </svg>
        <div className="w-7 h-7 rounded-full border-[2.5px] border-transparent border-t-primary animate-[spinner-rotate_0.8s_cubic-bezier(0.4,0,0.2,1)_infinite] motion-reduce:animate-none motion-reduce:border-t-muted-foreground motion-reduce:opacity-50" />
        {fallbackMessage && (
          <p className="text-[13px] font-medium text-muted-foreground dark:text-foreground/60 tracking-[-0.01em]">
            {fallbackMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function mountApp() {
  if (!root) {
    root = ReactDOM.createRoot(document.getElementById("root"));
  }
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <I18nextProvider i18n={i18n}>
          <SettingsProvider>
            <ToastProvider>
              <AppRouter />
            </ToastProvider>
          </SettingsProvider>
        </I18nextProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
