#!/usr/bin/env node

/**
 * Node2AI License Management CLI
 * For Foundry360 internal use to generate and manage licenses
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync } from 'fs';
import { LicenseManager, LicenseTier, LicenseFeature, License } from './index';

const program = new Command();
const licenseManager = new LicenseManager();

program
  .name('node2ai-license')
  .description('Node2AI License Management Tool')
  .version('1.0.0');

// Generate license command
program
  .command('generate')
  .description('Generate a new license')
  .option('-o, --org <name>', 'Organization name')
  .option('-i, --org-id <id>', 'Organization ID')
  .option('-s, --seats <number>', 'Maximum seats', '10')
  .option(
    '-t, --tier <tier>',
    'License tier (trial|starter|professional|enterprise)'
  )
  .option('-d, --days <number>', 'Validity in days', '365')
  .option('--output <file>', 'Output file for license', './license.json')
  .action(async options => {
    const spinner = ora('Generating license...').start();

    try {
      // Interactive prompts if options not provided
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'organizationName',
          message: 'Organization name:',
          when: !options.org,
          validate: input => input.length > 0 || 'Organization name required',
        },
        {
          type: 'input',
          name: 'organizationId',
          message: 'Organization ID (unique):',
          when: !options.orgId,
          default: () => `org-${Date.now()}`,
        },
        {
          type: 'number',
          name: 'maxSeats',
          message: 'Maximum seats:',
          when: !options.seats,
          default: 10,
          validate: input => input > 0 || 'Must be greater than 0',
        },
        {
          type: 'list',
          name: 'tier',
          message: 'License tier:',
          when: !options.tier,
          choices: [
            {
              name: 'Trial (30 days, basic features)',
              value: LicenseTier.TRIAL,
            },
            { name: 'Starter (basic features)', value: LicenseTier.STARTER },
            {
              name: 'Professional (advanced features)',
              value: LicenseTier.PROFESSIONAL,
            },
            {
              name: 'Enterprise (all features)',
              value: LicenseTier.ENTERPRISE,
            },
          ],
        },
        {
          type: 'number',
          name: 'validityDays',
          message: 'Validity (days):',
          when: !options.days,
          default: 365, // Default: 365 days (12 months)
        },
      ]);

      const params = {
        organizationName: options.org || answers.organizationName,
        organizationId: options.orgId || answers.organizationId,
        maxSeats: parseInt(options.seats || answers.maxSeats),
        tier: (options.tier || answers.tier) as LicenseTier,
        validityDays: parseInt(options.days || answers.validityDays),
      };

      // Generate license
      const license = await licenseManager.generateLicense(params);

      spinner.succeed('License generated successfully!');

      // Display license info
      console.log('\n' + chalk.bold('License Information:'));
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log(chalk.cyan('License Key:     ') + chalk.bold(license.key));
      console.log(chalk.cyan('Organization:    ') + license.organizationName);
      console.log(chalk.cyan('Organization ID: ') + license.organizationId);
      console.log(chalk.cyan('Tier:            ') + license.tier);
      console.log(chalk.cyan('Max Seats:       ') + license.maxSeats);
      console.log(
        chalk.cyan('Issued:          ') + license.issuedAt.toISOString()
      );
      console.log(
        chalk.cyan('Expires:         ') + license.expiresAt.toISOString()
      );
      console.log(chalk.cyan('Features:        ') + license.features.length);
      license.features.forEach(f => console.log(chalk.gray('  - ' + f)));
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

      // Save to file
      const outputFile = options.output || './license.json';
      writeFileSync(outputFile, JSON.stringify(license, null, 2));
      console.log(chalk.green(`\n✅ License saved to: ${outputFile}`));

      // Display customer delivery message
      console.log('\n' + chalk.bold('Customer Delivery:'));
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      console.log('Provide the customer with:');
      console.log(chalk.yellow(`  License Key: ${license.key}`));
      console.log('  License file: ' + outputFile);
      console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    } catch (error) {
      spinner.fail('License generation failed');
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red('Error:'), errorMessage);
      process.exit(1);
    }
  });

// Validate license command
program
  .command('validate')
  .description('Validate a license key')
  .argument('<license-key>', 'License key to validate')
  .option('-s, --seats <number>', 'Current seat count for validation')
  .action(async (licenseKey, options) => {
    const spinner = ora('Validating license...').start();

    try {
      const result = await licenseManager.validateLicense(licenseKey, {
        checkSeats: !!options.seats,
        currentSeatCount: options.seats ? parseInt(options.seats) : undefined,
      });

      if (result.valid) {
        spinner.succeed('License is valid!');

        if (result.warnings.length > 0) {
          console.log('\n' + chalk.yellow('Warnings:'));
          result.warnings.forEach(w => console.log(chalk.yellow('  ⚠️  ' + w)));
        }

        if (result.license) {
          console.log('\n' + chalk.bold('License Details:'));
          console.log(
            chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          );
          console.log(
            chalk.cyan('Organization:    ') + result.license.organizationName
          );
          console.log(chalk.cyan('Tier:            ') + result.license.tier);
          console.log(
            chalk.cyan('Max Seats:       ') + result.license.maxSeats
          );
          console.log(
            chalk.cyan('Expires:         ') +
              result.license.expiresAt.toISOString()
          );

          if (result.seatUsage) {
            const usage = result.seatUsage;
            const color =
              usage.percentage >= 90
                ? chalk.red
                : usage.percentage >= 75
                  ? chalk.yellow
                  : chalk.green;
            console.log(
              chalk.cyan('Seat Usage:      ') +
                color(
                  `${usage.used}/${usage.available} (${usage.percentage.toFixed(0)}%)`
                )
            );
          }

          console.log(
            chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          );
        }
      } else {
        spinner.fail('License validation failed');
        console.log('\n' + chalk.red('Errors:'));
        result.errors.forEach(e => console.log(chalk.red('  ❌ ' + e)));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Validation error');
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(chalk.red('Error:'), errorMessage);
      process.exit(1);
    }
  });

// List features command
program
  .command('features')
  .description('List all available license features')
  .action(() => {
    console.log(chalk.bold('\nAvailable License Features:'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    console.log(chalk.cyan('\nCore Features (All Tiers):'));
    console.log('  • Multi-provider AI support');
    console.log('  • Basic analytics');
    console.log('  • API access');

    console.log(chalk.cyan('\nProfessional Features:'));
    console.log('  • Advanced analytics');
    console.log('  • SSO/SAML integration');
    console.log('  • Audit logs');
    console.log('  • Custom roles');

    console.log(chalk.cyan('\nEnterprise Features:'));
    console.log('  • Air-gapped deployment');
    console.log('  • Dedicated support');
    console.log('  • Custom SLA');
    console.log('  • White-labeling');
    console.log('  • Multi-tenancy');
    console.log('  • Advanced security');

    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  });

program.parse();
