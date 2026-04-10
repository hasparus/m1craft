import { theGuild } from "@hasparus/eslint-config";

export default [
  ...theGuild,
  { ignores: ["dist", "node_modules"] },
  { rules: { "no-console": "off", "unicorn/no-process-exit": "off" } },
];
