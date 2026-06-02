#!/usr/bin/env node
/**
 * scripts/db-migrate.js
 * Pilote Liquibase pour la base de données Supabase/PostgreSQL.
 *
 * Usage :
 *   node scripts/db-migrate.js update          → applique toutes les migrations manquantes
 *   node scripts/db-migrate.js status          → liste l'état des changelogs
 *   node scripts/db-migrate.js rollback <tag>  → rollback jusqu'au tag donné
 *   node scripts/db-migrate.js tag <nom>       → pose un tag (point de rollback)
 *   node scripts/db-migrate.js validate        → valide les fichiers changelog
 *
 * Prérequis : copier liquibase/liquibase.properties.example → liquibase/liquibase.properties
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { Liquibase } = require('liquibase')
const path = require('path')
const fs = require('fs')
/* eslint-enable @typescript-eslint/no-require-imports */

const propsFile = path.resolve(__dirname, '../liquibase/liquibase.properties')
if (!fs.existsSync(propsFile)) {
  console.error('\n❌  Fichier manquant : liquibase/liquibase.properties')
  console.error('    Copiez liquibase.properties.example et remplissez les valeurs.\n')
  process.exit(1)
}

const config = {
  changeLogFile: 'liquibase/changelog/db.changelog-master.xml',
  liquibasePropertiesFile: propsFile,
}

const instance = new Liquibase(config)

const [,, command, ...args] = process.argv

const commands = {
  update:   () => instance.update({}),
  status:   () => instance.status({}),
  validate: () => instance.validate(),
  rollback: () => {
    const tag = args[0]
    if (!tag) { console.error('Usage: rollback <tag>'); process.exit(1) }
    return instance.rollback({ rollbackTag: tag })
  },
  tag: () => {
    const tag = args[0]
    if (!tag) { console.error('Usage: tag <nom>'); process.exit(1) }
    return instance.tag({ tag })
  },
}

if (!commands[command]) {
  console.error(`\n❌  Commande inconnue : "${command}"`)
  console.error('    Commandes disponibles : update | status | validate | rollback <tag> | tag <nom>\n')
  process.exit(1)
}

console.log(`\n🚀  Liquibase → ${command}\n`)

commands[command]()
  .then(() => console.log(`\n✅  ${command} terminé avec succès.\n`))
  .catch(err => {
    console.error(`\n❌  Erreur lors de "${command}" :`, err.message || err)
    process.exit(1)
  })
