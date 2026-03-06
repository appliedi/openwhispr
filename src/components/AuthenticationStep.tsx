import React, { useCallback, useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import {
  signInWithBrowser,
  handleAuthCallback,
  updateLastSignInTime,
  isAuthenticated,
} from "../lib/clerkAuth";
import { OPENWHISPR_API_URL } from "../config/constants";
import { Button } from "./ui/button";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import logoIcon from "../assets/icon.png";
import logger from "../utils/logger";

interface AuthenticationStepProps {
  onContinueWithoutAccount: () => void;
  onAuthComplete: () => void;
  onNeedsVerification: (email: string) => void;
}

const GoogleIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export default function AuthenticationStep({
  onContinueWithoutAccount,
  onAuthComplete,
  onNeedsVerification: _onNeedsVerification,
}: AuthenticationStepProps) {
  const { t } = useTranslation();
  const { isSignedIn, isLoaded, user } = useAuth();
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbackProcessedRef = useRef(false);

  // Handle auth callback from protocol redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasToken = params.has("token");

    if (hasToken && !callbackProcessedRef.current) {
      callbackProcessedRef.current = true;
      const result = handleAuthCallback(params);

      if (result.success) {
        updateLastSignInTime();
        logger.debug("Auth callback completed", undefined, "auth");

        // Clean URL params
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        url.searchParams.delete("userId");
        url.searchParams.delete("email");
        url.searchParams.delete("name");
        url.searchParams.delete("plan");
        window.history.replaceState({}, "", url.toString());
      } else {
        setError(t("auth.errors.generic"));
      }
    }
  }, [t]);

  // Auto-complete when signed in
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const initAndComplete = async () => {
      if (OPENWHISPR_API_URL && user) {
        try {
          const { getAuthHeaders } = await import("../lib/clerkAuth");
          const res = await fetch(`${OPENWHISPR_API_URL}/api/auth/init-user`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getAuthHeaders(),
            },
            body: JSON.stringify({
              userId: user.id,
              email: user.email,
              name: user.name || null,
            }),
          });
          if (!res.ok) {
            logger.error("init-user returned non-OK", { status: res.status }, "auth");
          }
        } catch (err) {
          logger.error("Failed to init user", err, "auth");
        }
      }
      onAuthComplete();
    };
    initAndComplete();
  }, [isLoaded, isSignedIn, user, onAuthComplete]);

  // Reset social loading when window regains focus (user came back from browser)
  useEffect(() => {
    if (!isSocialLoading) return;

    const handleFocus = () => {
      // Check if auth completed while browser was open
      if (isAuthenticated()) return;
      setTimeout(() => setIsSocialLoading(false), 1000);
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isSocialLoading]);

  const handleSignIn = useCallback(async () => {
    setIsSocialLoading(true);
    setError(null);

    const result = await signInWithBrowser();

    if (result.error) {
      setError(result.error.message || t("auth.errors.generic"));
      setIsSocialLoading(false);
    }
  }, [t]);

  // Auth not configured state
  if (!OPENWHISPR_API_URL) {
    return (
      <div className="space-y-3">
        <div className="text-center mb-4">
          <img
            src={logoIcon}
            alt="OpenWhispr"
            className="w-12 h-12 mx-auto mb-2.5 rounded-lg shadow-sm"
          />
          <p className="text-lg font-semibold text-foreground tracking-tight leading-tight">
            {t("auth.welcomeTitle")}
          </p>
          <p className="text-muted-foreground text-sm mt-1 leading-tight">
            {t("auth.welcomeSubtitle")}
          </p>
        </div>

        <div className="bg-warning/5 p-2.5 rounded border border-warning/20">
          <p className="text-xs text-warning text-center leading-snug">
            {t("auth.cloudNotConfigured")}
          </p>
        </div>

        <Button onClick={onContinueWithoutAccount} className="w-full h-9">
          <span className="text-sm font-medium">{t("auth.getStarted")}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  // Already signed in state
  if (isLoaded && isSignedIn) {
    return (
      <div className="space-y-3">
        <div className="text-center mb-4">
          <img
            src={logoIcon}
            alt="OpenWhispr"
            className="w-12 h-12 mx-auto mb-2.5 rounded-lg shadow-sm"
          />
          <div className="w-5 h-5 mx-auto bg-success/10 rounded-full flex items-center justify-center mb-2">
            <Check className="w-3 h-3 text-success" />
          </div>
          <p className="text-lg font-semibold text-foreground tracking-tight leading-tight">
            {user?.name
              ? t("auth.signedIn.welcomeBackName", { name: user.name })
              : t("auth.signedIn.welcomeBack")}
          </p>
          <p className="text-muted-foreground text-sm mt-1 leading-tight">
            {t("auth.signedIn.ready")}
          </p>
        </div>
        <Button onClick={onAuthComplete} className="w-full h-9">
          <span className="text-sm font-medium">{t("auth.common.continue")}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    );
  }

  // Main sign-in view
  return (
    <div className="space-y-3">
      <div className="text-center mb-4">
        <img
          src={logoIcon}
          alt="OpenWhispr"
          className="w-12 h-12 mx-auto mb-2.5 rounded-lg shadow-sm"
        />
        <p className="text-lg font-semibold text-foreground tracking-tight leading-tight">
          {t("auth.welcomeTitle")}
        </p>
        <p className="text-muted-foreground text-sm mt-1 leading-tight">
          {t("auth.welcomeSubtitle")}
        </p>
      </div>

      <Button
        type="button"
        variant="social"
        onClick={handleSignIn}
        disabled={isSocialLoading}
        className="w-full h-9"
      >
        {isSocialLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">
              {t("auth.social.completeInBrowser")}
            </span>
          </>
        ) : (
          <>
            <GoogleIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{t("auth.social.continueWithGoogle")}</span>
          </>
        )}
      </Button>

      {error && (
        <div className="px-3 py-2 rounded-md bg-destructive/5 border border-destructive/20 flex items-center gap-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      <div className="pt-1">
        <button
          type="button"
          onClick={onContinueWithoutAccount}
          className="w-full text-center text-xs text-muted-foreground/85 hover:text-foreground transition-colors py-1.5 rounded hover:bg-muted/30"
          disabled={isSocialLoading}
        >
          {t("auth.emailStep.continueWithoutAccount")}
        </button>
      </div>

      <p className="text-xs text-muted-foreground/80 leading-tight text-center">
        {t("auth.legal.prefix")}{" "}
        <a
          href="https://openwhispr.com/terms"
          target="_blank"
          rel="noopener noreferrer"
          className="text-link underline decoration-link/30 hover:decoration-link/60 transition-colors"
        >
          {t("auth.legal.terms")}
        </a>{" "}
        {t("auth.legal.and")}{" "}
        <a
          href="https://openwhispr.com/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-link underline decoration-link/30 hover:decoration-link/60 transition-colors"
        >
          {t("auth.legal.privacy")}
        </a>
        {t("auth.legal.suffix")}
      </p>
    </div>
  );
}
