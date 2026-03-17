/**
 * Unified Suggestions Controller
 * Uses exclusionLogicService as SINGLE source of truth
 */

const statisticsService = require('../services/statisticsService');
const exclusionService = require('../services/exclusionService');
const exclusionLogic = require('../services/exclusionLogicService');
const STATS_CONFIG = require('../config/stats-config');

/**
 * Get suggestions using unified exclusion logic
 * Both statistics page and simulation use the same logic
 */
exports.getConfidenceSuggestions = async (req, res) => {
    try {
        const strategy = req.query.strategy || STATS_CONFIG.EXCLUSION_STRATEGY || 'BALANCED';

        // Use the unified function from exclusionService
        const result = await exclusionService.getFullExclusionResult({ strategy });

        // Calculate numbers to bet
        const numbersToBet = [];
        for (let i = 0; i < 100; i++) {
            if (!result.excludedNumbers.has(i)) {
                numbersToBet.push(i);
            }
        }

        // Check skip condition
        const isSkipped = numbersToBet.length <= 0;

        res.json({
            excludedNumbers: Array.from(result.excludedNumbers).sort((a, b) => a - b),
            explanations: result.explanations,
            numbersToBet,
            isSkipped,
            excludedCount: result.excludedNumbers.size,
            // Strategy info
            strategyInfo: result.stats
        });

    } catch (error) {
        console.error('Error generating suggestions:', error);
        res.status(500).json({ error: 'Failed to generate suggestions' });
    }
};

/**
 * Get available strategies and current config
 */
exports.getStrategies = (req, res) => {
    res.json({
        current: STATS_CONFIG.EXCLUSION_STRATEGY || 'BALANCED',
        method: STATS_CONFIG.EXCLUSION_METHOD || 'VOTING',
        available: exclusionLogic.STRATEGIES,
        weights: exclusionLogic.WEIGHTS,
        votingConfig: {
            minVotes: STATS_CONFIG.VOTING_MIN_VOTES || 2,
            minWeight: STATS_CONFIG.VOTING_MIN_WEIGHT || 0.5,
            maxNumbers: STATS_CONFIG.VOTING_MAX_NUMBERS || 50
        },
        winRateConfig: {
            minWinRate: STATS_CONFIG.MIN_WIN_RATE || 0.3
        }
    });
};
