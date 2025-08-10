import { createRequire } from 'module';

import fs from 'fs';
import path from 'path';

import { pathConfig } from '../../lib/helpers.js';
import { getFileName, setLogLevel, log } from '../../lib/functions.js';

const require = createRequire(import.meta.url);

const undo = async (argv) => {
  setLogLevel(argv.logLevel);

  const configOptions = pathConfig(argv);

  const { migrationsDir, stateDir } = configOptions;

  log(1, `configOptions:${JSON.stringify(configOptions, null, 2)}`);

  const curStatePath = path.join(stateDir, '_current.json');
  const curStateName = getFileName(curStatePath);
  let curStateRevision;

  let bakStatePath = path.join(stateDir, '_current_bak.json');
  let bakStateName;
  let bakStateRevision;

  let curMigPath;
  let curMigName;
  let curMigRevision;

  if (fs.existsSync(curStatePath)) {
    // eslint-disable-next-line import/no-dynamic-require
    try {
      const curState = JSON.parse(await fs.promises.readFile(curStatePath, 'utf8'));
      bakStatePath = curState.backupPath;

      curStateRevision = curState.revision;
      log(3, `Current state file: ${curStateName}, Revision: ${curStateRevision}`);
    } catch (error) {
      log(3, `Error reading current state file: ${error.message}`);
    }
  } else {
    log(3, `Can't find current state. Skipping`);
  }

  if (fs.existsSync(migrationsDir)) {
    const allFiles = fs.readdirSync(migrationsDir);
    
    const migs = allFiles.filter(file => {
      return file.endsWith('.js') && 
             !file.startsWith('_current') && 
             !file.includes('_bak');
    });

    if (migs.length > 0) {
      curMigName = migs[migs.length - 1];
      curMigPath = path.join(migrationsDir, curMigName);

      try {
        const migrationModule = await import(`file:///${curMigPath}`);
        curMigRevision = migrationModule.default.info.revision;
        log(3, `Current migration file: ${curMigName}, Revision: ${curMigRevision}`);
      } catch (error) {
        log(3, `Error reading migration file: ${error.message}`);
      }
    } else {
      log(3, `Can't find any migrations files. Skipping`);
    }
  } else {
    log(3, `Can't find any migrations folder. Skipping`);
  }

  if (fs.existsSync(bakStatePath)) bakStateRevision = curStateRevision - 1;

  if (
    argv.force ||
    !argv.delCurStt ||
    !argv.delCurMig ||
    !argv.renBakStt ||
    !curStateRevision ||
    !curMigRevision ||
    curMigRevision === curStateRevision
  ) {
    if (curStateRevision && argv.delCurStt) {
      fs.unlinkSync(curStatePath);
      log(3, `Deleted current state file: ${curStateName}`);
    }

    if (curMigRevision && argv.delCurMig) {
      fs.unlinkSync(curMigPath);
      log(3, `Deleted current migration file: ${curMigName}`);
    }

    if (bakStateRevision && argv.renBakStt) {
      fs.renameSync(bakStatePath, curStatePath);

      bakStateName = getFileName(bakStatePath);
      log(
        3,
        `Reverted to backup state: ${bakStateName} new name: ${curStateName}, Revision: ${bakStateRevision}`,
      );
    } else if (!bakStateRevision) {
      log(3, "Can't find backup state. Skipping.");
    }
    log(3, 'We are done!');
  } else {
    log(
      3,
      `Revisions from current state and current migration Are not equal.
      So they are not synced. anyway you can force tool running with -f or turn on specific options`,
    );
  }
};

export default undo;
