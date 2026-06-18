import { isBase64MediaHistoryContent, parseBase64MediaHistoryContent, replaceBase64WithVisionDescription, } from "@llm-tg-bot/modules-history";
import { describeVisionImages } from "./describe.js";
export function createVisionQueueScheduler(deps) {
    let timer = null;
    let status = "idle";
    let abort = false;
    function setStatus(next) {
        status = next;
        deps.onStatusChange?.(next);
    }
    async function runJob() {
        if (deps.getQueueSize() > 0)
            return;
        setStatus("running");
        abort = false;
        deps.logEvent?.("vision_backfill_started", {});
        try {
            for (const convKey of deps.listHistoryChatKeys(50)) {
                if (deps.getQueueSize() > 0 || abort)
                    break;
                const messages = deps.getHistory(convKey);
                for (const row of messages) {
                    if (deps.getQueueSize() > 0 || abort)
                        break;
                    if (!isBase64MediaHistoryContent(row.content))
                        continue;
                    const parsed = parseBase64MediaHistoryContent(row.content);
                    if (!parsed)
                        continue;
                    const description = await describeVisionImages({
                        images: [{ base64: parsed.base64, mimeHint: parsed.mimeHint }],
                        logContext: { convKey, backfill: true },
                    }, deps.describeConfig);
                    if (!description)
                        continue;
                    deps.mapHistoryBase64Media(convKey, (content) => content === row.content, (content) => replaceBase64WithVisionDescription(content, description));
                }
            }
            deps.logEvent?.("vision_backfill_finished", {});
        }
        catch (err) {
            deps.logEventError?.("vision_backfill_failed", err, {});
        }
        finally {
            if (deps.getQueueSize() === 0)
                setStatus("idle");
        }
    }
    function schedule() {
        if (timer)
            clearTimeout(timer);
        if (deps.getQueueSize() > 0) {
            setStatus("idle");
            return;
        }
        setStatus("scheduled");
        const delayMs = deps.getConfig().backfillDebounceSec * 1000;
        timer = setTimeout(() => {
            timer = null;
            if (deps.getQueueSize() > 0) {
                setStatus("idle");
                return;
            }
            void runJob();
        }, delayMs);
    }
    return {
        onQueueActivity() {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            abort = true;
            if (deps.getQueueSize() > 0) {
                setStatus("idle");
                return;
            }
            schedule();
        },
        getStatus() {
            return status;
        },
    };
}
