import type { MigrationInterface, QueryRunner } from 'typeorm';

/** One upgrade adoption; later explicit theme choices are never reset on startup. */
export class AdoptLumenDefaults1794146400000 implements MigrationInterface {
  name = 'AdoptLumenDefaults1794146400000';

  async up(runner: QueryRunner): Promise<void> {
    const table = await runner.getTable('user_settings');
    const current = table?.findColumnByName('interfaceTheme');
    if (!current)
      throw new Error('User interface settings are not initialized.');
    const next = current.clone();
    next.default = "'persiusNG'";
    await runner.changeColumn('user_settings', current, next);
    await runner.query(
      `UPDATE "user_settings" SET "interfaceTheme" = 'persiusNG'`
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    const table = await runner.getTable('user_settings');
    const current = table?.findColumnByName('interfaceTheme');
    if (!current) return;
    const next = current.clone();
    next.default = "'seerrOrig'";
    await runner.changeColumn('user_settings', current, next);
  }
}
