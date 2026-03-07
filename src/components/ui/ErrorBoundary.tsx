import React, { type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryInner extends React.Component<
  ErrorBoundaryProps & { resetLabel: string; errorTitle: string; errorDescription: string },
  ErrorBoundaryState
> {
  constructor(
    props: ErrorBoundaryProps & {
      resetLabel: string;
      errorTitle: string;
      errorDescription: string;
    }
  ) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <h3 className="text-sm font-semibold text-foreground/70 mb-2">{this.props.errorTitle}</h3>
          <p className="text-xs text-muted-foreground mb-4">{this.props.errorDescription}</p>
          <Button variant="outline" size="sm" onClick={() => this.setState({ hasError: false })}>
            {this.props.resetLabel}
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ErrorBoundary({ children, fallback }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  return (
    <ErrorBoundaryInner
      fallback={fallback}
      errorTitle={t("errorBoundary.title")}
      errorDescription={t("errorBoundary.description")}
      resetLabel={t("errorBoundary.retry")}
    >
      {children}
    </ErrorBoundaryInner>
  );
}
