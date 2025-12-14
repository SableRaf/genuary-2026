#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const SKETCHES_DIR = path.join(ROOT_DIR, 'sketches');
const DEFAULT_PROMPTS_PATH = path.join(ROOT_DIR, 'prompts.json');
const PROMPTS_KEY = 'genuaryPrompts';

function isUrl(input) {
    try {
        const url = new URL(input);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

async function fetchFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.text();
}

async function loadPrompts(promptsPath) {
    let raw;

    if (isUrl(promptsPath)) {
        console.log('Fetching from URL...');
        raw = await fetchFromUrl(promptsPath);
    } else {
        raw = await fs.readFile(promptsPath, 'utf8');
    }

    const parsed = JSON.parse(raw);
    const prompts = parsed[PROMPTS_KEY];

    if (!Array.isArray(prompts)) {
        throw new Error(
            `Prompts file is missing the "${PROMPTS_KEY}" array.`
        );
    }

    return prompts;
}

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

function sketchNameFromEntry(entry, index) {
    const dayNumber = String(index + 1).padStart(2, '0');
    const shorthandSource = pickShorthandSource(entry, dayNumber);
    const shorthand = sanitize(shorthandSource);

    return `${dayNumber}_${shorthand}`;
}

function pickShorthandSource(entry, dayNumber) {
    if (typeof entry.shorthand === 'string' && entry.shorthand.trim()) {
        return entry.shorthand;
    }

    if (typeof entry.name === 'string' && entry.name.trim()) {
        return entry.name;
    }

    if (entry.date) {
        return entry.date;
    }

    return `day-${dayNumber}`;
}

function sanitize(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'sketch';
}

function runCreate(sketchName) {
    return new Promise((resolve, reject) => {
        const child = spawn(
            'npm',
            ['create', 'p5js', sketchName, '--', '--yes'],
            {
                cwd: SKETCHES_DIR,
                stdio: 'inherit',
                shell: process.platform === 'win32'
            }
        );

        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`npm create p5js exited with code ${code}`));
            }
        });

        child.on('error', reject);
    });
}

async function main() {
    const promptsPathArg = process.argv
        .slice(2)
        .find((arg) => arg && arg !== '--');
    const promptsPath = promptsPathArg && isUrl(promptsPathArg)
        ? promptsPathArg
        : promptsPathArg
        ? path.resolve(process.cwd(), promptsPathArg)
        : DEFAULT_PROMPTS_PATH;

    let displayPath;
    if (isUrl(promptsPath)) {
        displayPath = promptsPath;
    } else {
        const relativePath = path.relative(ROOT_DIR, promptsPath);
        displayPath =
            relativePath && !relativePath.startsWith('..')
                ? relativePath
                : path.basename(promptsPath);
    }

    console.log(`Using prompts file: ${displayPath}`);

    const prompts = await loadPrompts(promptsPath);

    if (prompts.length === 0) {
        console.log('No prompts to process.');
        return;
    }

    await fs.mkdir(SKETCHES_DIR, { recursive: true });

    for (const [index, entry] of prompts.entries()) {
        const sketchName = sketchNameFromEntry(entry, index);
        const sketchPath = path.join(SKETCHES_DIR, sketchName);

        if (await pathExists(sketchPath)) {
            console.log(`Skipping ${sketchName} (already exists).`);
            continue;
        }

        console.log(`Creating ${sketchName}...`);
        await runCreate(sketchName);
    }

    console.log('Done creating sketches.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
