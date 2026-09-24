import { useState } from "react";
import { useLocation } from "react-router-dom";

import type { AuthRedirectState } from "@/api/auth-guard";
import { ApiKeyForm } from "@/components/ApiKeyForm";
import { ApiStatus } from "@/components/ApiStatus";
import { CardManager } from "@/components/cards/CardManager";
import { CategoryManager } from "@/components/categories/CategoryManager";
import { IncomeSettings } from "@/components/income/IncomeSettings";
import { PageTitle } from "@/components/layout/PageTitle";

export default function SettingsPage() {
  const [refreshToken, setRefreshToken] = useState(0);
  const state = useLocation().state as Partial<AuthRedirectState> | null;

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle>設定</PageTitle>
      <ApiKeyForm reason={state?.reason} onChange={() => setRefreshToken((n) => n + 1)} />
      <ApiStatus refreshToken={refreshToken} />
      <IncomeSettings />
      <CardManager />
      <CategoryManager />
    </div>
  );
}
