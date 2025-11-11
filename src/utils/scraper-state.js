/**
 * Scraper State Management Module
 * Handles persistent state storage for the Muck Rack outlet scraper
 * Enables resume capability and tracks visited URLs
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

export class ScraperState {
  constructor(baseDir = 'data') {
    this.stateDir = path.join(baseDir, 'state');
    this.queueFile = path.join(this.stateDir, 'outlet-urls-queue.json');
    this.visitedFile = path.join(this.stateDir, 'outlet-urls-visited.json');
    this.failedFile = path.join(this.stateDir, 'outlet-urls-failed.json');
    this.progressFile = path.join(this.stateDir, 'scraper-progress.json');
    this.batchDir = path.join(baseDir, 'batches');

    // Ensure directories exist
    this.ensureDirectories();
  }

  /**
   * Ensure all required directories exist
   */
  ensureDirectories() {
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
    if (!existsSync(this.batchDir)) {
      mkdirSync(this.batchDir, { recursive: true });
    }
  }

  /**
   * Load URLs from the queue
   * @returns {Array} Array of URLs to process
   */
  async loadQueue() {
    if (existsSync(this.queueFile)) {
      try {
        const data = readFileSync(this.queueFile, 'utf-8');
        return JSON.parse(data).urls || [];
      } catch (error) {
        console.error('Error loading queue:', error);
        return [];
      }
    }
    return [];
  }

  /**
   * Save URLs to the queue
   * @param {Array} urls - URLs to save
   * @param {boolean} append - Whether to append to existing queue
   */
  async saveQueue(urls, append = false) {
    let existingUrls = [];
    if (append) {
      existingUrls = await this.loadQueue();
    }

    const allUrls = [...existingUrls, ...urls];
    // Remove duplicates
    const uniqueUrls = [...new Set(allUrls)];

    const data = {
      urls: uniqueUrls,
      totalCount: uniqueUrls.length,
      lastUpdated: new Date().toISOString()
    };

    writeFileSync(this.queueFile, JSON.stringify(data, null, 2));
    console.log(`Queue saved: ${uniqueUrls.length} URLs`);
  }

  /**
   * Load visited URLs
   * @returns {Set} Set of visited URLs for fast lookup
   */
  async loadVisited() {
    if (existsSync(this.visitedFile)) {
      try {
        const data = readFileSync(this.visitedFile, 'utf-8');
        const parsed = JSON.parse(data);
        return new Set(parsed.urls || []);
      } catch (error) {
        console.error('Error loading visited URLs:', error);
        return new Set();
      }
    }
    return new Set();
  }

  /**
   * Save visited URLs
   * @param {Set|Array} urls - Visited URLs
   */
  async saveVisited(urls) {
    const urlArray = Array.isArray(urls) ? urls : Array.from(urls);
    const data = {
      urls: urlArray,
      count: urlArray.length,
      lastUpdated: new Date().toISOString()
    };

    writeFileSync(this.visitedFile, JSON.stringify(data, null, 2));
  }

  /**
   * Load progress metadata
   * @returns {Object} Progress information
   */
  async loadProgress() {
    if (existsSync(this.progressFile)) {
      try {
        const data = readFileSync(this.progressFile, 'utf-8');
        return JSON.parse(data);
      } catch (error) {
        console.error('Error loading progress:', error);
        return this.getDefaultProgress();
      }
    }
    return this.getDefaultProgress();
  }

  /**
   * Save progress metadata
   * @param {Object} progress - Progress data to save
   */
  async saveProgress(progress) {
    const data = {
      ...progress,
      lastUpdated: new Date().toISOString()
    };

    writeFileSync(this.progressFile, JSON.stringify(data, null, 2));
  }

  /**
   * Get default progress structure
   */
  getDefaultProgress() {
    return {
      currentPage: 1,
      totalPages: 0,
      totalUrlsCollected: 0,
      totalUrlsProcessed: 0,
      totalUrlsFailed: 0,
      lastProcessedUrl: null,
      startTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      status: 'initializing'
    };
  }

  /**
   * Mark a URL as visited with its data
   * @param {string} url - URL that was visited
   * @param {Object} data - Extracted data (optional)
   */
  async markVisited(url, data = null) {
    // Load existing visited URLs
    const visited = await this.loadVisited();
    visited.add(url);
    await this.saveVisited(visited);

    // Update progress
    const progress = await this.loadProgress();
    progress.totalUrlsProcessed = visited.size;
    progress.lastProcessedUrl = url;
    await this.saveProgress(progress);

    // Optionally save the extracted data
    if (data) {
      const batchFile = path.join(this.batchDir, `item-${Date.now()}.json`);
      writeFileSync(batchFile, JSON.stringify({ url, data, timestamp: new Date().toISOString() }, null, 2));
    }
  }

  /**
   * Mark a URL as failed
   * @param {string} url - URL that failed
   * @param {Error} error - Error information
   */
  async markFailed(url, error) {
    let failed = {};
    if (existsSync(this.failedFile)) {
      try {
        const data = readFileSync(this.failedFile, 'utf-8');
        failed = JSON.parse(data);
      } catch (e) {
        failed = {};
      }
    }

    if (!failed.urls) {
      failed.urls = {};
    }

    failed.urls[url] = {
      error: error.message || String(error),
      timestamp: new Date().toISOString(),
      attempts: (failed.urls[url]?.attempts || 0) + 1
    };

    failed.count = Object.keys(failed.urls).length;
    failed.lastUpdated = new Date().toISOString();

    writeFileSync(this.failedFile, JSON.stringify(failed, null, 2));

    // Update progress
    const progress = await this.loadProgress();
    progress.totalUrlsFailed = failed.count;
    await this.saveProgress(progress);
  }

  /**
   * Get unprocessed URLs (in queue but not visited)
   * @param {number} limit - Maximum number of URLs to return
   * @returns {Array} URLs that haven't been processed yet
   */
  async getUnprocessedUrls(limit = null) {
    const queue = await this.loadQueue();
    const visited = await this.loadVisited();

    const unprocessed = queue.filter(url => !visited.has(url));

    if (limit && limit > 0) {
      return unprocessed.slice(0, limit);
    }

    return unprocessed;
  }

  /**
   * Remove URL from queue
   * @param {string} url - URL to remove
   */
  async removeFromQueue(url) {
    const queue = await this.loadQueue();
    const filtered = queue.filter(u => u !== url);
    await this.saveQueue(filtered, false);
  }

  /**
   * Clear all state files (for fresh start)
   */
  async clearState() {
    const files = [this.queueFile, this.visitedFile, this.failedFile, this.progressFile];
    for (const file of files) {
      if (existsSync(file)) {
        writeFileSync(file, '{}');
      }
    }
    console.log('State cleared');
  }

  /**
   * Get statistics about current state
   */
  async getStats() {
    const queue = await this.loadQueue();
    const visited = await this.loadVisited();
    const progress = await this.loadProgress();

    let failed = { count: 0 };
    if (existsSync(this.failedFile)) {
      try {
        const data = readFileSync(this.failedFile, 'utf-8');
        failed = JSON.parse(data);
      } catch (e) {
        // Ignore
      }
    }

    return {
      totalQueued: queue.length,
      totalVisited: visited.size,
      totalFailed: failed.count || 0,
      totalRemaining: queue.length - visited.size,
      progress: progress
    };
  }

  /**
   * Check if URL has been visited
   * @param {string} url - URL to check
   * @returns {boolean} True if visited
   */
  async isVisited(url) {
    const visited = await this.loadVisited();
    return visited.has(url);
  }

  /**
   * Save batch of item data
   * @param {Array} items - Array of item data objects
   * @param {number} batchNumber - Batch identifier
   */
  async saveBatch(items, batchNumber) {
    const batchFile = path.join(this.batchDir, `batch-${String(batchNumber).padStart(3, '0')}.json`);
    const data = {
      batchNumber,
      count: items.length,
      timestamp: new Date().toISOString(),
      items
    };

    writeFileSync(batchFile, JSON.stringify(data, null, 2));
    console.log(`Batch ${batchNumber} saved: ${items.length} items`);
  }
}

export default ScraperState;