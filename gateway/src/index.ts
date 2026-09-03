import { createApplianceGateway } from './api/app-factory.js';
import { loadConfig } from './shared/config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const gateway = await createApplianceGateway({ config });
  const server = await gateway.buildServer();

  await server.listen({ host: config.host, port: config.port });
  console.log(
    `Node2AI Gateway listening on http://${config.host}:${config.port} (mode=${config.deploymentMode}, persistence=${gateway.persistence})`,
  );
  console.log('Canonical AI path: POST /v1/ai/completions');
  console.log('Admin API: /v1/admin/*');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
