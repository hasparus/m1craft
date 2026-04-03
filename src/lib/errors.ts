import { createTaggedError } from "errore";

export class HttpError extends createTaggedError({
  message: "$method $url returned $status",
  name: "HttpError",
}) {}

export class ValidationError extends createTaggedError({
  message: "Invalid $source response: $summary",
  name: "ValidationError",
}) {}

export class AuthError extends createTaggedError({
  message: "$message",
  name: "AuthError",
}) {}

export class XboxError extends createTaggedError({
  message: "Xbox auth failed: $reason",
  name: "XboxError",
}) {}

export class LaunchError extends createTaggedError({
  message: "$message",
  name: "LaunchError",
}) {}
