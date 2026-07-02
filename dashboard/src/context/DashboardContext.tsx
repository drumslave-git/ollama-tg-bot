import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  type ContextBudget,
  type DerivedHistoryLimits,
  type LlmModel,
  type Settings,
  type Stats,
} from "../api";
import {
  getLiveSocket,
  useLiveSettings,
  useLiveSocketConnected,
  useLiveStats,
} from "../liveSocket";
import {
  analyzeModelConfig,
  hasModelConfigErrors,
} from "../modelConfig";
import { buildModelOptions, resolveModelSelection } from "../modelOptions";

export type SectionKey =
  | "settings"
  | "stats"
  | "llm"
  | "models"
  | "embedding"
  | "save";

interface DashboardContextValue {
  settings: Settings | null;
  draft: Settings | null;
  setDraft: React.Dispatch<React.SetStateAction<Settings | null>>;
  stats: Stats | null;
  models: LlmModel[];
  embeddingModels: LlmModel[];
  llmOk: boolean | null;
  tavilyConfigured: boolean | null;
  apiOnline: boolean | null;
  loading: boolean;
  saving: boolean;
  modelsLoading: boolean;
  embeddingModelsLoading: boolean;
  testingLlm: boolean;
  llmConnectionVerified: boolean;
  sectionErrors: Partial<Record<SectionKey, unknown>>;
  saveOk: boolean;
  setSectionError: (key: SectionKey, err: unknown | null) => void;
  load: () => Promise<void>;
  fetchModels: () => Promise<void>;
  fetchEmbeddingModels: () => Promise<void>;
  testLlmConnection: () => Promise<void>;
  save: () => Promise<void>;
  modelOptions: ReturnType<typeof buildModelOptions>;
  embeddingModelOptions: ReturnType<typeof buildModelOptions>;
  showModelSelection: boolean;
  configBlocked: boolean;
  apiUnreachable: boolean;
  primaryLoadError: unknown;
  contextBudget: ContextBudget | null;
  derivedHistoryLimits: DerivedHistoryLimits | null;
  budgetLoading: boolean;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [embeddingModels, setEmbeddingModels] = useState<LlmModel[]>([]);
  const [llmOk, setLlmOk] = useState<boolean | null>(null);
  const [tavilyConfigured, setTavilyConfigured] = useState<boolean | null>(
    null,
  );
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [embeddingModelsLoading, setEmbeddingModelsLoading] = useState(false);
  const [testingLlm, settestingLlm] = useState(false);
  const [llmConnectionVerified, setLlmConnectionVerified] = useState(false);
  const [sectionErrors, setSectionErrors] = useState<
    Partial<Record<SectionKey, unknown>>
  >({});
  const [saveOk, setSaveOk] = useState(false);
  const [contextBudget, setContextBudget] = useState<ContextBudget | null>(null);
  const [derivedHistoryLimits, setDerivedHistoryLimits] = useState<DerivedHistoryLimits | null>(null);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const budgetTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const setSectionError = (key: SectionKey, err: unknown | null) => {
    setSectionErrors((prev) => {
      const next = { ...prev };
      if (err == null) delete next[key];
      else next[key] = err;
      return next;
    });
  };

  const refreshBudget = useCallback(
    async (model: string, numPredict: number, numCtx: number) => {
      if (!model || numPredict == null || numCtx == null) return null;
      setBudgetLoading(true);
      try {
        const result = await api.getBudget(model, numPredict, numCtx);
        setContextBudget(result.contextBudget);
        setDerivedHistoryLimits(result.derivedHistoryLimits);
        setSectionError("models", null);
        return result;
      } catch (err) {
        setContextBudget(null);
        setDerivedHistoryLimits(null);
        setSectionError("models", err);
        return null;
      } finally {
        setBudgetLoading(false);
      }
    },
    [],
  );

  const applyModels = useCallback((list: LlmModel[]) => {
    setModels(list);
    setDraft((d) =>
      d ? { ...d, model: resolveModelSelection(list, d.model) } : d,
    );
  }, []);

  /** Load the embedding host's model list; returns an error to surface, or null on success. */
  const loadEmbeddingModels = useCallback(async (): Promise<unknown | null> => {
    try {
      setEmbeddingModels(await api.getEmbeddingModels());
      return null;
    } catch (err) {
      setEmbeddingModels([]);
      return err;
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    const [health, settingsRes] = await Promise.allSettled([
      api.checkHealth(),
      api.getSettings(),
    ]);

    const nextErrors: Partial<Record<SectionKey, unknown>> = {};

    if (health.status === "fulfilled") {
      setApiOnline(health.value.ok);
    } else {
      setApiOnline(false);
      nextErrors.settings = health.reason;
      nextErrors.stats = health.reason;
    }

    if (settingsRes.status === "fulfilled") {
      setSettings(settingsRes.value);
      setDraft(settingsRes.value);
    } else {
      nextErrors.settings = settingsRes.reason;
    }

    const llmBaseUrl =
      settingsRes.status === "fulfilled"
        ? settingsRes.value.llmBaseUrl.trim()
        : "";

    let llmReachable = false;
    if (llmBaseUrl) {
      try {
        await api.llmHealth();
        llmReachable = true;
        setLlmOk(true);
      } catch (err) {
        setLlmOk(false);
        nextErrors.llm = err;
      }
    } else {
      setLlmOk(false);
    }

    const embeddingHostDistinct =
      settingsRes.status === "fulfilled"
        ? settingsRes.value.embeddingHostDistinct
        : false;

    if (llmBaseUrl && llmReachable) {
      try {
        const list = await api.getModels();
        setLlmConnectionVerified(true);
        applyModels(list);
        if (embeddingHostDistinct) {
          const embErr = await loadEmbeddingModels();
          if (embErr) nextErrors.embedding = embErr;
        } else {
          setEmbeddingModels([]);
        }
      } catch (err) {
        setLlmConnectionVerified(false);
        setModels([]);
        setEmbeddingModels([]);
        nextErrors.models = err;
      }
    } else {
      setLlmConnectionVerified(false);
      setModels([]);
      setEmbeddingModels([]);
    }

    try {
      const tavily = await api.tavilyStatus();
      setTavilyConfigured(tavily.configured);
    } catch {
      setTavilyConfigured(null);
    }

    setSectionErrors(nextErrors);
    setLoading(false);
  }, [applyModels, loadEmbeddingModels]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!draft?.model || draft.numPredict == null || draft.numCtx == null) {
      setContextBudget(null);
      setDerivedHistoryLimits(null);
      return;
    }
    if (budgetTimerRef.current) clearTimeout(budgetTimerRef.current);
    budgetTimerRef.current = setTimeout(() => {
      void refreshBudget(draft.model, draft.numPredict, draft.numCtx);
    }, 300);
    return () => {
      if (budgetTimerRef.current) clearTimeout(budgetTimerRef.current);
    };
  }, [draft?.model, draft?.numPredict, draft?.numCtx, refreshBudget]);

  const handleSocketConnected = useCallback((connected: boolean) => {
    setApiOnline(connected);
    if (connected) {
      setSectionErrors((prev) => {
        const next = { ...prev };
        delete next.stats;
        return next;
      });
    }
  }, []);

  useLiveSocketConnected(handleSocketConnected);

  useLiveStats(
    useCallback((st) => {
      setStats(st);
      setSectionErrors((prev) => {
        const next = { ...prev };
        delete next.stats;
        return next;
      });
    }, []),
  );

  useLiveSettings(
    useCallback(
      (updated) => {
        setSettings(updated);
        setDraft((current) => {
          if (saving || !current || !settingsRef.current) return current;
          const draftMatchesSaved =
            JSON.stringify(current) === JSON.stringify(settingsRef.current);
          return draftMatchesSaved ? updated : current;
        });
        if (llmConnectionVerified) {
          void api.llmHealth().then(() => setLlmOk(true)).catch(() => setLlmOk(false));
        }
      },
      [saving, llmConnectionVerified],
    ),
  );

  useEffect(() => {
    const socket = getLiveSocket();
    const onReconnect = () => {
      void load();
    };
    socket.io.on("reconnect", onReconnect);
    return () => {
      socket.io.off("reconnect", onReconnect);
    };
  }, [load]);

  const fetchModels = async () => {
    setModelsLoading(true);
    setSectionError("models", null);
    try {
      const list = await api.getModels();
      applyModels(list);
      setSectionErrors((prev) => {
        const next = { ...prev };
        delete next.models;
        return next;
      });
    } catch (err) {
      setModels([]);
      setSectionError("models", err);
      throw err;
    } finally {
      setModelsLoading(false);
    }
  };

  const fetchEmbeddingModels = async () => {
    setEmbeddingModelsLoading(true);
    setSectionError("embedding", null);
    try {
      setEmbeddingModels(await api.getEmbeddingModels());
      setSectionErrors((prev) => {
        const next = { ...prev };
        delete next.embedding;
        return next;
      });
    } catch (err) {
      setEmbeddingModels([]);
      setSectionError("embedding", err);
      throw err;
    } finally {
      setEmbeddingModelsLoading(false);
    }
  };

  const testLlmConnection = async () => {
    if (!draft) return;
    setSectionError("llm", null);
    setSectionError("models", null);
    setSectionError("embedding", null);

    if (!draft.llmBaseUrl.trim()) {
      setSectionError(
        "llm",
        new Error("LLM_BASE_URL is not configured on the server"),
      );
      return;
    }

    settestingLlm(true);
    setLlmConnectionVerified(false);
    setModels([]);
    setEmbeddingModels([]);

    try {
      await api.llmHealth();
      setLlmConnectionVerified(true);
      setLlmOk(true);
      await fetchModels();
      if (draft.embeddingHostDistinct) {
        try {
          await api.embeddingHealth();
          await fetchEmbeddingModels();
        } catch (err) {
          setSectionError("embedding", err);
        }
      }
      setSectionErrors((prev) => {
        const next = { ...prev };
        delete next.llm;
        return next;
      });
    } catch (err) {
      setLlmConnectionVerified(false);
      setModels([]);
      setLlmOk(false);
      setSectionError("llm", err);
    } finally {
      settestingLlm(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    const budgetResult = await refreshBudget(
      draft.model,
      draft.numPredict,
      draft.numCtx,
    );
    if (!budgetResult) {
      setSectionError(
        "save",
        new Error("Failed to fetch context budget from server. Check server logs."),
      );
      return;
    }
    const analysis = analyzeModelConfig(
      draft,
      budgetResult.contextBudget,
      budgetResult.derivedHistoryLimits,
    );
    if (hasModelConfigErrors(analysis.issues)) {
      setSectionError(
        "save",
        new Error(
          analysis.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message)
            .join(" "),
        ),
      );
      return;
    }
    setSaving(true);
    setSaveOk(false);
    setSectionError("save", null);
    try {
      const updated = await api.updateSettings(analysis.settings);
      setSettings(updated);
      setDraft(updated);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (err) {
      setSectionError("save", err);
    } finally {
      setSaving(false);
    }
  };

  const modelOptions = useMemo(() => buildModelOptions(models), [models]);

  // When the embedding host is the same as the LLM host, reuse the LLM model list;
  // otherwise the embedding dropdown is populated from the embedding host's models.
  const embeddingModelOptions = useMemo(
    () =>
      settings?.embeddingHostDistinct
        ? buildModelOptions(embeddingModels)
        : modelOptions,
    [settings?.embeddingHostDistinct, embeddingModels, modelOptions],
  );

  const showModelSelection = llmConnectionVerified;

  const apiUnreachable = apiOnline === false;
  const configBlocked = apiUnreachable || !!sectionErrors.settings;

  const primaryLoadError =
    sectionErrors.settings ?? sectionErrors.stats ?? null;

  const value: DashboardContextValue = {
    settings,
    draft,
    setDraft,
    stats,
    models,
    embeddingModels,
    llmOk,
    tavilyConfigured,
    apiOnline,
    loading,
    saving,
    modelsLoading,
    embeddingModelsLoading,
    testingLlm,
    llmConnectionVerified,
    sectionErrors,
    saveOk,
    setSectionError,
    load,
    fetchModels,
    fetchEmbeddingModels,
    testLlmConnection,
    save,
    modelOptions,
    embeddingModelOptions,
    showModelSelection,
    configBlocked,
    apiUnreachable,
    primaryLoadError,
    contextBudget,
    derivedHistoryLimits,
    budgetLoading,
  };

  return (
    <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard must be used within DashboardProvider");
  }
  return ctx;
}
