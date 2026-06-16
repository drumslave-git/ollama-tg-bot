export {
  addressingDetectionModule,
  detectAddressing,
  type AddressingDetectionConfig,
  type AddressingDetectionInput,
  type AddressingDetectionOutput,
} from "./detect.js";
export {
  addressCheckModule,
  checkMessageAddressed,
  type AddressCheckConfig,
  type AddressCheckInput,
  type AddressCheckResult,
  type AddressSource,
} from "./check-addressed.js";
export {
  buildBotAddressIdentity,
  messageReferencesBotByName,
  stripBotAddressing,
  type BotAddressIdentity,
} from "./bot-identity.js";
export { stripNonBotMentions } from "./strip-non-bot-mentions.js";
export {
  isMessageForBot,
  sliceEntity,
  type MessageForBotInput,
} from "./telegram-address.js";
export {
  ANALYZER_SYSTEM,
  ADDRESS_RESPONSE_FORMAT,
  buildAddressAnalyzerMessages,
  formatBotLabels,
  parseAddressDecision,
} from "./prompt.js";
export { pipelineHost } from "./pipeline.js";
