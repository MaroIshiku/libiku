const loginFlags = new Set(["--account", "--locale"]);

export function parseLibationCommand(input) {
  if (typeof input !== "string" || !input.length || input.length > 512 || /[^\x20-\x7e\t]/.test(input)) return null;
  const tokens = input.trim().split(/[ \t]+/);
  if (tokens[0].toLowerCase() === "libationcli") tokens.shift();
  const [verb, ...args] = tokens;

  switch (verb) {
    case "help":
    case "--help":
      return args.length === 0 ? { args: ["--help"] } : null;
    case "version":
    case "--version":
      return args.length === 0 ? { args: ["--version"] } : null;
    case "list-accounts":
      return args.length === 0 || (args.length === 1 && args[0] === "--bare") ? { args: tokens } : null;
    case "scan":
    case "set-status":
    case "convert":
      return args.length === 0 ? { action: verb } : null;
    case "liberate": {
      const action = { action: verb };
      for (const argument of args) {
        if (argument === "--pdf" && !action.pdf) action.pdf = true;
        else if (argument === "--force" && !action.force) action.force = true;
        else if (!action.asin && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(argument)) action.asin = argument;
        else return null;
      }
      return action;
    }
    case "login-external": {
      const [firstFlag, firstValue, secondFlag, secondValue] = args;
      if (args.length !== 4 || firstFlag === secondFlag || !loginFlags.has(firstFlag) || !loginFlags.has(secondFlag)) return null;
      return { login: { [firstFlag.slice(2)]: firstValue, [secondFlag.slice(2)]: secondValue } };
    }
    default:
      return null;
  }
}
