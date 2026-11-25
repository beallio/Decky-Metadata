import { useCallback, useEffect, useRef, useState } from "react";

import {
  setCompatibilityDefault as saveCompatibilityDefault,
  setCompatibilityDefaultScope as saveCompatibilityDefaultScope,
} from "../backend";
import {
  compatibilityDefaultLoadedSnapshot,
  compatibilityDefaultScopeSnapshot,
  compatibilityDefaultSnapshot,
  compatibilityLifecycleSnapshot,
  ensureCompatibilityDefault,
  isCompatibilityLifecycleCurrent,
  setConfirmedCompatibilityDefault,
  setConfirmedCompatibilityDefaultScope,
  subscribeCompatibilityRevision,
} from "../steam";
import {
  beginCompatibilityPolicySave,
  compatibilityPolicySaveSnapshot,
  discardStaleCompatibilityPolicySave,
  hasPendingCompatibilityPolicySave,
  settleCompatibilityPolicySave,
  subscribeCompatibilityPolicySave,
} from "../compatibilityPolicySave";
import { t, translateBackendError } from "../i18n";
import * as log from "../log";
import { toastError, toastSuccess } from "../toast";
import type { CompatibilityDefaultScope, DeckCompatibilityCategory } from "../types";

export function useCompatibilityPolicy() {
  const initialSave = compatibilityPolicySaveSnapshot();
  const initialPendingSave = initialSave?.pendingKind ? initialSave : null;
  const [compatibilityDefault, setCompatibilityDefault] = useState<DeckCompatibilityCategory | null>(
    initialPendingSave ? initialPendingSave.category : compatibilityDefaultSnapshot(),
  );
  const [compatibilityDefaultLoaded, setCompatibilityDefaultLoaded] = useState(false);
  const [compatibilityDefaultBusy, setCompatibilityDefaultBusy] = useState(
    initialPendingSave?.pendingKind === "category",
  );
  const [compatibilityDefaultError, setCompatibilityDefaultError] = useState(initialSave?.error ?? "");
  const [compatibilityDefaultScope, setCompatibilityDefaultScope] = useState<CompatibilityDefaultScope>(
    initialPendingSave ? initialPendingSave.scope : compatibilityDefaultScopeSnapshot(),
  );
  const [compatibilityDefaultScopeBusy, setCompatibilityDefaultScopeBusy] = useState(
    initialPendingSave?.pendingKind === "scope",
  );
  const compatibilityDefaultLoadVersion = useRef(0);

  const synchronizePolicySave = useCallback((
    fallbackCategory = compatibilityDefaultSnapshot(),
    fallbackScope = compatibilityDefaultScopeSnapshot(),
  ) => {
    const shared = compatibilityPolicySaveSnapshot();
    if (
      shared
      && shared.lifecycleGeneration === compatibilityLifecycleSnapshot()
      && shared.pendingKind !== null
    ) {
      setCompatibilityDefault(shared.category);
      setCompatibilityDefaultScope(shared.scope);
      setCompatibilityDefaultBusy(shared.pendingKind === "category");
      setCompatibilityDefaultScopeBusy(shared.pendingKind === "scope");
      setCompatibilityDefaultError(shared.error);
      return;
    }
    setCompatibilityDefault(fallbackCategory);
    setCompatibilityDefaultScope(fallbackScope);
    setCompatibilityDefaultBusy(false);
    setCompatibilityDefaultScopeBusy(false);
    setCompatibilityDefaultError(
      shared?.lifecycleGeneration === compatibilityLifecycleSnapshot() ? shared.error : "",
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    discardStaleCompatibilityPolicySave(compatibilityLifecycleSnapshot());
    synchronizePolicySave();
    const requestVersion = compatibilityDefaultLoadVersion.current;
    void ensureCompatibilityDefault()
      .then((value) => {
        if (cancelled || requestVersion !== compatibilityDefaultLoadVersion.current) return;
        synchronizePolicySave(value, compatibilityDefaultScopeSnapshot());
        setCompatibilityDefaultLoaded(true);
      })
      .catch((error: unknown) => {
        if (cancelled || requestVersion !== compatibilityDefaultLoadVersion.current) return;
        const shared = compatibilityPolicySaveSnapshot();
        if (shared?.lifecycleGeneration === compatibilityLifecycleSnapshot()) {
          synchronizePolicySave();
          return;
        }
        setCompatibilityDefaultError(t("panel.compatibilityDefaultLoadError", {
          error: translateBackendError(error),
        }));
        log.warn("bridge", "compatibility default load failed", error);
      });
    const unsubscribeRevision = subscribeCompatibilityRevision(() => {
      if (cancelled || !compatibilityDefaultLoadedSnapshot()) return;
      synchronizePolicySave();
      setCompatibilityDefaultLoaded(true);
    });
    const unsubscribeSave = subscribeCompatibilityPolicySave(() => {
      if (!cancelled) synchronizePolicySave();
    });
    return () => {
      cancelled = true;
      unsubscribeRevision();
      unsubscribeSave();
    };
  }, [synchronizePolicySave]);

  const onCompatibilityDefaultChange = async (category: DeckCompatibilityCategory | null) => {
    if (hasPendingCompatibilityPolicySave() || !compatibilityDefaultLoaded) return;
    const previous = compatibilityDefault;
    const lifecycleGeneration = compatibilityLifecycleSnapshot();
    const saveId = beginCompatibilityPolicySave(
      "category",
      lifecycleGeneration,
      previous,
      compatibilityDefaultScope,
    );
    compatibilityDefaultLoadVersion.current += 1;
    try {
      const saved = await saveCompatibilityDefault(category);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const confirmed = setConfirmedCompatibilityDefault(saved, lifecycleGeneration);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      settleCompatibilityPolicySave(saveId, lifecycleGeneration, confirmed, compatibilityDefaultScope);
      toastSuccess(t("panel.toast.compatibility"), t("panel.compatibilitySaved"));
    } catch (error) {
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const message = t("panel.compatibilitySaveError", {
        error: translateBackendError(error),
      });
      settleCompatibilityPolicySave(saveId, lifecycleGeneration, previous, compatibilityDefaultScope, message);
      toastError(t("panel.toast.compatibility"), message);
      log.warn("bridge", "compatibility default save failed", error);
    }
  };

  const onCompatibilityDefaultScopeChange = async (scope: CompatibilityDefaultScope) => {
    if (
      hasPendingCompatibilityPolicySave()
      || !compatibilityDefaultLoaded
      || compatibilityDefault === null
    ) return;
    const previous = compatibilityDefaultScope;
    const lifecycleGeneration = compatibilityLifecycleSnapshot();
    const saveId = beginCompatibilityPolicySave(
      "scope",
      lifecycleGeneration,
      compatibilityDefault,
      scope,
    );
    compatibilityDefaultLoadVersion.current += 1;
    try {
      const saved = await saveCompatibilityDefaultScope(scope);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const confirmed = setConfirmedCompatibilityDefaultScope(saved, lifecycleGeneration);
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      settleCompatibilityPolicySave(saveId, lifecycleGeneration, compatibilityDefault, confirmed);
      toastSuccess(t("panel.toast.compatibility"), t("panel.compatibilityScopeSaved"));
    } catch (error) {
      if (!isCompatibilityLifecycleCurrent(lifecycleGeneration)) return;
      const message = t("panel.compatibilityScopeSaveError", {
        error: translateBackendError(error),
      });
      settleCompatibilityPolicySave(saveId, lifecycleGeneration, compatibilityDefault, previous, message);
      toastError(t("panel.toast.compatibility"), message);
      log.warn("bridge", "compatibility default scope save failed", error);
    }
  };

  return {
    compatibilityDefault,
    compatibilityDefaultLoaded,
    compatibilityDefaultBusy,
    compatibilityDefaultError,
    compatibilityDefaultScope,
    compatibilityDefaultScopeBusy,
    onCompatibilityDefaultChange,
    onCompatibilityDefaultScopeChange,
  };
}
