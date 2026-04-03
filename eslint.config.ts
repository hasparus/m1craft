import hasparus from "@hasparus/eslint-config";

export default [
  ...hasparus.theGuild,
  { ignores: ["dist", "node_modules"] },
  { rules: { "unicorn/no-process-exit": "off" } },
];
