/** OpenAPI 3.1 description of the public Sift extract API. */

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Sift Public API",
    version: "1.0.0",
    description:
      "Extract structured fields from a publicly reachable PDF or image URL. " +
      "Required: `url`. Optional: `model`, `max_tokens`. " +
      "Default model is DeepSeek V4 Flash (open-source, text PDFs). Claude models support vision/scans.",
  },
  servers: [{ url: "/", description: "This Sift instance" }],
  paths: {
    "/api/v1/extract": {
      get: {
        operationId: "extractFromUrl",
        summary: "Extract from a document URL",
        description:
          "Classifies the PDF locally, extracts native Markdown when possible, then returns a cited extraction. " +
          "Default: DeepSeek (text-based PDFs). Use a Claude model for scanned PDFs and images.",
        tags: ["Extract"],
        parameters: [
          {
            name: "url",
            in: "query",
            required: true,
            description:
              "Public http(s) URL of a supported file: PDF, JPG, JPEG, PNG, or WEBP.",
            schema: { type: "string", format: "uri" },
            example: "https://example.com/invoice.pdf",
          },
          {
            name: "model",
            in: "query",
            required: false,
            description:
              "Model id. DeepSeek (default, open-source, text PDFs): deepseek-v4-flash, deepseek-v4-pro. " +
              "Claude (vision): claude-sonnet-4-6, claude-haiku-4-5, claude-opus-4-8.",
            schema: {
              type: "string",
              enum: [
                "deepseek-v4-flash",
                "deepseek-v4-pro",
                "claude-sonnet-4-6",
                "claude-haiku-4-5",
                "claude-opus-4-8",
              ],
              default: "deepseek-v4-flash",
            },
            example: "deepseek-v4-flash",
          },
          {
            name: "max_tokens",
            in: "query",
            required: false,
            description:
              "Maximum output tokens for the model call (256–16000). Defaults to 8000.",
            schema: {
              type: "integer",
              minimum: 256,
              maximum: 16000,
              default: 8000,
            },
            example: 4000,
          },
        ],
        responses: {
          "200": {
            description: "Extraction succeeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ExtractResponse" },
              },
            },
          },
          "400": {
            description: "Missing, invalid, or unsupported URL",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
          "500": {
            description: "Server misconfiguration (e.g. missing API key)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
          "502": {
            description: "Upstream model failure",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApiError" },
              },
            },
          },
        },
      },
    },
    "/api/health": {
      get: {
        operationId: "health",
        summary: "Health check",
        tags: ["Meta"],
        responses: {
          "200": {
            description: "Service is up",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                  required: ["ok"],
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      FieldBBox: {
        type: "object",
        required: ["x", "y", "w", "h", "page"],
        properties: {
          x: { type: "number", description: "Left edge, 0–1 of page width" },
          y: { type: "number", description: "Top edge, 0–1 of page height" },
          w: { type: "number", description: "Width, 0–1 of page width" },
          h: { type: "number", description: "Height, 0–1 of page height" },
          page: { type: "integer", description: "1-based page index" },
        },
      },
      ExtractedField: {
        type: "object",
        required: ["key", "value", "source", "confidence"],
        properties: {
          key: { type: "string" },
          value: { type: "string" },
          source: {
            type: "string",
            description: "Exact supporting snippet from the document",
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          bbox: { $ref: "#/components/schemas/FieldBBox" },
        },
      },
      TokenUsage: {
        type: "object",
        properties: {
          inputTokens: { type: "integer" },
          outputTokens: { type: "integer" },
        },
      },
      ExtractResponse: {
        type: "object",
        required: ["documentType", "plainText", "fields", "json"],
        properties: {
          documentType: { type: "string" },
          plainText: { type: "string" },
          fields: {
            type: "array",
            items: { $ref: "#/components/schemas/ExtractedField" },
          },
          json: {
            type: "object",
            additionalProperties: true,
            description:
              "Convenience map: each field key → { value, source, confidence }, plus `_document_type`.",
          },
          usage: { $ref: "#/components/schemas/TokenUsage" },
        },
      },
      ApiError: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
    },
  },
  tags: [
    { name: "Extract", description: "Document extraction" },
    { name: "Meta", description: "Service metadata" },
  ],
} as const;
