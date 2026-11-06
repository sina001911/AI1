import { pathToFileURL } from 'url';
const pkgUrl = pathToFileURL('D:/AI1/node_modules/.pnpm/@tanstack+router-generator@1.167.34_supports-color@8.1.1/node_modules/@tanstack/router-generator/dist/esm/index.js').href;
const mod = await import(pkgUrl);
const { Generator, getConfig } = mod;

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