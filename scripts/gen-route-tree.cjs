const { createRequire } = require('module');
const load = createRequire('D:/AI1/node_modules/.pnpm/@tanstack+router-generator@1.167.34_supports-color@8.1.1/node_modules/@tanstack/router-generator/dist/esm/index.js');
const { Generator, getConfig } = load;

(async () => {
  const root = 'D:/AI1';
  const config = getConfig({
    target: 'react',
    routesDirectory: 'src/renderer/routes',
    generatedRouteTree: 'src/renderer/routeTree.gen.ts',
    autoCodeSplitting: true,
  }, root);

  const generator = new Generator({ config, root });
  await generator.run();
  const tree = generator.getRoutesByFileMap();
  console.log(tree.fileRoutes.map((r) => r.routePath).join('\n'));
})().catch((e) => { console.error(e); process.exit(1); });