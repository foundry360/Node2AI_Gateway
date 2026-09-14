import { createApplianceGateway } from './api/app-factory.js';
import { loadConfig } from './shared/config.js';
import { assertStartupConfigSafety } from './shared/production-config.js';

async function main(): Promise<void> {
  const config = loadConfig();
  assertStartupConfigSafety(config);
  const gateway = await createApplianceGateway({ config });
  const server = await gateway.buildServer();

  await server.listen({ host: config.host, port: config.port });
  console.log(
    `Enigma AI Action Governance Gateway listening on http://${config.host}:${config.port} (mode=${config.deploymentMode}, persistence=${gateway.persistence}, policy=${config.policyEngineMode}, actors=${config.actorRegistryMode})`,
  );
  console.log('Canonical AI path: POST /v1/ai/completions');
  console.log('Admin API: /v1/admin/*');

  const stop = () => {
    if ('stopBackgroundJobs' in gateway && typeof gateway.stopBackgroundJobs === 'function') {
      gateway.stopBackgroundJobs();
    }
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
