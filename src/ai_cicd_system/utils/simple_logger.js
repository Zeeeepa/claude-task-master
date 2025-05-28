/**
 * Simple logger utility for AI-CICD system
 * No external dependencies
 */

export function log(level, message) {
    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase();
    console.log(`[${timestamp}] ${levelUpper}: ${message}`);
}

export function info(message) {
    log('info', message);
}

export function warn(message) {
    log('warn', message);
}

export function error(message) {
    log('error', message);
}

export function debug(message) {
    log('debug', message);
}

