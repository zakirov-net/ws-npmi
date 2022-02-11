#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');
const download = require('download');
const UrlParse = require('url-parse');

// Пакеты, которые в любом случае ставятся через npm install
const PACKAGES_FOR_NPM = ['saby-typescript', 'saby-builder', 'saby-units'];

const NODE_DIR = process.cwd() + '/node_modules/';

const packageJson = require(process.cwd() + '/package.json');

main();

async function main() {
    const npmDependencies = [];
    const downloadDependencies = [];
    for (const [packageName, packageUrl] of Object.entries(packageJson.devDependencies)) {
        if (PACKAGES_FOR_NPM.includes(packageName) || !packageUrl.startsWith('git+')) {
            npmDependencies.push(packageName);
        } else {
            downloadDependencies.push([packageName, packageUrl.replace(/^git\+/, '')]);
        }
    }
    if (npmDependencies.length) {
        execCommand(`npm install ${npmDependencies.join(' ')} --no-save`);
    }
    if (downloadDependencies.length) {
        await downloadPackages(downloadDependencies);
    }
    execCommand('npm run postinstall');
    // Отменяем ненужные изменения файлов.
    execCommand('git checkout HEAD -- tsconfig.json tslint.json');
    console.log('Installation complete.')
}

function execCommand(command) {
    execSync(command, {stdio: 'inherit'});
}

/**
 * Скачивание пакетов из репозитория в виде zip-файлов и их распаковка в папку node_modules
 */
async function downloadPackages(downloadDependencies) {
    const dirsForRename = [];

    for (const [packageName, packageUrl] of downloadDependencies) {
        const urlParsed = new UrlParse(packageUrl);
        const branchId = urlParsed.hash.replace('#', '');
        const gitPath = urlParsed.pathname.toLowerCase().replace(/\.git$/, '');
        const repoName = path.basename(gitPath);
        const gitUrl = urlParsed.origin + gitPath +
            // Разные пути к архиву в зависимости от того, это гитхаб или гитлаб
            (urlParsed.host === 'github.com' ? '/archive/' : `/-/archive/${branchId}/${repoName}-`) +
            `${branchId}.zip`;
        const downloadDirName = `${repoName}-${branchId}`;
        console.log(`Downloading package ${packageName}, url: ${gitUrl}`);
        try {
            await download(gitUrl, NODE_DIR, { extract: true });
        } catch (e) {
            console.log('[DOWNLOAD ERROR] ' + e.message);
        }
        dirsForRename.push([downloadDirName, packageName]);
    }
    await renameDirs(dirsForRename);
}

/**
 * Переименовывание скачанных папок из служебных имен в имена npm-модулей.
 */
async function renameDirs(dirsForRename) {
    console.log('Wait...');
    // Иногда если переименовать папки сразу, возникает фигня с правами, возможно, из-за антивируса.
    // Поэтому делаем небольшую паузу. Но все равно иногда падает.
    return new Promise((resolve) => {
        setTimeout(() => {
            for(const [srcDir, dstDir] of dirsForRename) {
                if (fs.existsSync(NODE_DIR + dstDir)) {
                    fs.rmdirSync(NODE_DIR + dstDir);
                }
                fs.renameSync(NODE_DIR + srcDir, NODE_DIR + dstDir);
            }
            resolve();
        }, 10000);
    });
}
