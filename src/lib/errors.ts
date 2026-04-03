import { createTaggedError } from "errore";

export class HttpError extends createTaggedError({
  name: "HttpError",
  message: "$method $url returned $status",
}) {}

export class ValidationError extends createTaggedError({
  name: "ValidationError",
  message: "Invalid $source response: $summary",
}) {}

export class AuthError extends createTaggedError({
  name: "AuthError",
  message: "$message",
}) {}

export class XboxError extends createTaggedError({
  name: "XboxError",
  message: "Xbox auth failed: $reason",
}) {}

export class LaunchError extends createTaggedError({
  name: "LaunchError",
  message: "$message",
}) {}
