/**
 * Integrations passthrough — single import surface for Base44 Core integrations
 * (file upload, LLM invoke, etc.), so components import from one place instead of
 * the two different spellings the legacy app used (`@/integrations/Core` vs
 * `base44.integrations.Core.*` — audit I-128).
 */
import { base44 } from './base44Client';

export const UploadFile = (args) => base44.integrations.Core.UploadFile(args);
export const InvokeLLM = (args) => base44.integrations.Core.InvokeLLM(args);
export const SendEmail = (args) => base44.integrations.Core.SendEmail(args);
export const ExtractDataFromUploadedFile = (args) =>
  base44.integrations.Core.ExtractDataFromUploadedFile(args);
