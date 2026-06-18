import { isBase64MediaHistoryContent, parseBase64MediaHistoryContent, replaceBase64WithVisionDescription, } from "@llm-tg-bot/modules-history";
import { describeVisionImages } from "./describe.js";
import { visionJobDebug } from "./job-debug.js";
export function createVisionQueueScheduler(deps) {
    let timer = null;
    let status = "idle";
    let abort = false;
    function setStatus(next) {
        status = next;
        visionJobDebug.setStatus(next);
        deps.onStatusChange?.(next);
    }
    async function runJob() {
        if (deps.getQueueSize() > 0)
            return;
        setStatus("running");
        visionJobDebug.startRun();
        abort = false;
        deps.logEvent?.("vision_backfill_started", {});
        try {
            const convKeys = deps.listHistoryChatKeys(50);
            visionJobDebug.addStep("Scan chats", { chatCount: convKeys.length });
            for (const convKey of convKeys) {
                if (deps.getQueueSize() > 0 || abort) {
                    visionJobDebug.addStep("Interrupted by queue activity", { convKey });
                    break;
                }
                const messages = deps.getHistory(convKey);
                for (const row of messages) {
                    if (deps.getQueueSize() > 0 || abort)
                        break;
                    if (!isBase64MediaHistoryContent(row.content))
                        continue;
                    const parsed = parseBase64MediaHistoryContent(row.content);
                    if (!parsed)
                        continue;
                    visionJobDebug.addStep("Describe media", {
                        convKey,
                        mediaKind: parsed.mediaKind,
                    });
                    const description = await describeVisionImages({
                        images: [{ base64: parsed.base64, mimeHint: parsed.mimeHint }],
                        logContext: { convKey, backfill: true },
                    }, deps.describeConfig);
                    if (!description) {
                        visionJobDebug.addStep("Describe failed", { convKey });
                        continue;
                    }
                    deps.mapHistoryBase64Media(convKey, (content) => content === row.content, (content) => replaceBase64WithVisionDescription(content, description));
                    visionJobDebug.addStep("Backfilled media", {
                        convKey,
                        mediaKind: parsed.mediaKind,
                        descriptionChars: description.length,
                    });
                }
            }
            visionJobDebug.completeRun();
            deps.logEvent?.("vision_backfill_finished", {});
        }
        catch (err) {
            visionJobDebug.failRun(err);
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
            visionJobDebug.cancelScheduled();
            setStatus("idle");
            return;
        }
        setStatus("scheduled");
        visionJobDebug.scheduleRun();
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
                visionJobDebug.cancelScheduled();
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
