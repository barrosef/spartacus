const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// Raiz do monorepo (frontend/)
const workspaceRoot = path.resolve(__dirname, "../");
const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Firebase 10 distribui bundles .cjs que Metro não processa por padrão
config.resolver.sourceExts = [...config.resolver.sourceExts, "cjs"];

// Metro já usa resolverMainFields = ["react-native", "browser", "main"] por padrão.
// Isso faz com que @firebase/auth resolva para dist/rn/index.js (bundle RN dedicado)
// e @firebase/app para dist/esm/index.esm2017.js (bundle browser).
// NÃO usar unstable_enablePackageExports — conflita com resolveRequest customizado
// e pode forçar resolução para bundles Node.js que importam undici.

// Força uma única instância de módulos singleton no bundle.
// Necessário em monorepo pnpm hoisted onde o mesmo pacote pode existir
// em dois lugares (app/node_modules e workspace/node_modules).
const SINGLETONS = new Set([
  "react",
  "react-native",
]);

function resolveSingleton(moduleName) {
  for (const base of [projectRoot, workspaceRoot]) {
    try {
      return require.resolve(moduleName, { paths: [base] });
    } catch (_) {}
  }
  throw new Error(
    `[metro.config] Não foi possível resolver singleton: ${moduleName}`,
  );
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (SINGLETONS.has(moduleName)) {
    return { type: "sourceFile", filePath: resolveSingleton(moduleName) };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
