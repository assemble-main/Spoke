export const errorCodeDescriptions: Record<string, string> = {
  "40001": "Invalid destination number",
  "40002": "Blocked as spam",
  "40003": "Blocked as spam",
  "40004": "Unknown",
  "40005": "Expired",
  "40006": "Carrier outage",
  "40007": "Unknown",
  "40008": "Unknown",
  "40009": "Invalid body",
  "40011": "Too many messages",
  "40012": "Invalid destination number",
  "21610": "Recipient unsubscribed",
  "30001": "Queue overflow",
  "30002": "Account suspended",
  "30003": "Unreachable phone number",
  "30004": "Message blocked",
  "30005": "Unknown destination handset",
  "30006": "Landline or unreachable carrier",
  "30007": "Blocked as spam",
  "30008": "Unknown error",
  "4405": "Unreachable sending phone number", // this one shouldn't happen
  "4406": "Unreachable phone number",
  "4432": "Unreachable country",
  "4434": "Unreachable toll-free number",
  "4470": "Blocked as spam by telecom provider (block can be contested)",
  "4700": "Landline or unreachable carrier",
  "4720": "Unreachable phone number",
  "4730": "Unreachable phone number (recipient maybe roaming)",
  "4740": "Unreachable sending phone number", // this one shouldn't happen, but has happened
  "4750": "Unknown AT&T Error (block can be contested)",
  "4770": "Blocked as spam (block can be contested)",
  "4780": "Carrier rejected (sending rates exceeded)",
  "4781": "Unknown AT&T Error (block can be contested)"
  "5106": "Unroutable (can be retried)",
  "5620": "Carrier outage",
  "9902": "Delivery receipt expired",
  "9999": "Unknown error"
};

export default errorCodeDescriptions;
