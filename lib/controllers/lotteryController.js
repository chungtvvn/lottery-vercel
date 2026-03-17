const lotteryService = require('../services/lotteryService');
const { 
    findEvenOddSumSequences, 
    findSoleSumSequences,
    findAdvancedSumSequences 
} = require('../utils/lotteryAnalyzerSumSequences');
const { findSpecificSumRangeSequences } = require('../utils/sumRangeAnalyzer');
const { findTraditionalSumRangeSequences } = require('../utils/traditionalSumRangeAnalyzer');
const lotteryScoring = require('../utils/lotteryScoring');
const suggestionService = require('../services/suggestionService'); // Import service mới

// ================================================================
// PHẦN THỐNG KÊ TỔNG HỢP NHANH (getOverallStats)
// ================================================================

// statFunctionsMap đã được bổ sung minDays để xử lý logic chuỗi nóng
const statFunctionsMap = {
    'consecutivePairs': { func: (data, start, end, days) => lotteryService.findConsecutivePairs(data, start, end, 'de', days), minDays: 2 },
    'consecutiveHeads': { func: (data, start, end, days) => lotteryService.findConsecutiveNumbers(data, start, end, 'head', 'de', days), minDays: 2 },
    'consecutiveTails': { func: (data, start, end, days) => lotteryService.findConsecutiveNumbers(data, start, end, 'tail', 'de', days), minDays: 2 },
    'alternatingNumberPairs': { func: (data, start, end, days) => lotteryService.findAlternatingNumberPairs(data, start, end, 'de', days), minDays: 3 },
    'alternatingHeads': { func: (data, start, end, days) => lotteryService.findAlternatingNumbers(data, start, end, 'head', 'de', days), minDays: 3 },
    'alternatingTails': { func: (data, start, end, days) => lotteryService.findAlternatingNumbers(data, start, end, 'tail', 'de', days), minDays: 3 },
    // Thêm 4 mục mới cho "dần" (monotonic)
    'head_inc_mono': { func: (data, start, end, days) => lotteryService.findIncreasingNumbers(data, start, end, 'head', 'de', days, 'monotonic'), minDays: 2 },
    'head_dec_mono': { func: (data, start, end, days) => lotteryService.findDecreasingNumbers(data, start, end, 'head', 'de', days, 'monotonic'), minDays: 2 },
    'tail_inc_mono': { func: (data, start, end, days) => lotteryService.findIncreasingNumbers(data, start, end, 'tail', 'de', days, 'monotonic'), minDays: 2 },
    'tail_dec_mono': { func: (data, start, end, days) => lotteryService.findDecreasingNumbers(data, start, end, 'tail', 'de', days, 'monotonic'), minDays: 2 },
    // Thêm 4 mục mới cho "dần đều" (arithmetic)
    'head_inc_arith': { func: (data, start, end, days) => lotteryService.findIncreasingNumbers(data, start, end, 'head', 'de', days, 'arithmetic'), minDays: 2 },
    'head_dec_arith': { func: (data, start, end, days) => lotteryService.findDecreasingNumbers(data, start, end, 'head', 'de', days, 'arithmetic'), minDays: 2 },
    'tail_inc_arith': { func: (data, start, end, days) => lotteryService.findIncreasingNumbers(data, start, end, 'tail', 'de', days, 'arithmetic'), minDays: 2 },
    'tail_dec_arith': { func: (data, start, end, days) => lotteryService.findDecreasingNumbers(data, start, end, 'tail', 'de', days, 'arithmetic'), minDays: 2 },

    // Thêm 4 mục mới cho các số
    'consecutive_inc_mono': { func: (data, start, end, days) => lotteryService.findConsecutiveIncreasingNumbers(data, start, end, 'de', days, 'monotonic'), minDays: 2 },
    'consecutive_dec_mono': { func: (data, start, end, days) => lotteryService.findConsecutiveDecreasingNumbers(data, start, end, 'de', days, 'monotonic'), minDays: 2 },
    'consecutive_inc_arith': { func: (data, start, end, days) => lotteryService.findConsecutiveIncreasingNumbers(data, start, end, 'de', days, 'arithmetic'), minDays: 2 },
    'consecutive_dec_arith': { func: (data, start, end, days) => lotteryService.findConsecutiveDecreasingNumbers(data, start, end, 'de', days, 'arithmetic'), minDays: 2 },

    // --- Dạng Chẵn-Chẵn ---
    'numpar_ee_mono_inc': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-even', 'monotonic_increasing'), minDays: 2 },
    'numpar_ee_arith_inc': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-even', 'arithmetic_increasing'), minDays: 2 },
    'numpar_ee_mono_dec': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-even', 'monotonic_decreasing'), minDays: 2 },
    'numpar_ee_arith_dec': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-even', 'arithmetic_decreasing'), minDays: 2 },
    'numpar_ee_occur': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-even', 'consecutive_occurrence'), minDays: 2 },
    
    // --- Dạng Chẵn-Lẻ ---
    'numpar_eo_mono_inc': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-odd', 'monotonic_increasing'), minDays: 2 },
    'numpar_eo_arith_inc': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-odd', 'arithmetic_increasing'), minDays: 2 },
    'numpar_eo_mono_dec': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-odd', 'monotonic_decreasing'), minDays: 2 },
    'numpar_eo_arith_dec': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-odd', 'arithmetic_decreasing'), minDays: 2 },
    'numpar_eo_occur': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'even-odd', 'consecutive_occurrence'), minDays: 2 },

    // --- Dạng Lẻ-Chẵn ---
    'numpar_oe_mono_inc': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-even', 'monotonic_increasing'), minDays: 2 },
    'numpar_oe_arith_inc': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-even', 'arithmetic_increasing'), minDays: 2 },
    'numpar_oe_mono_dec': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-even', 'monotonic_decreasing'), minDays: 2 },
    'numpar_oe_arith_dec': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-even', 'arithmetic_decreasing'), minDays: 2 },
    'numpar_oe_occur': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-even', 'consecutive_occurrence'), minDays: 2 },

    // --- Dạng Lẻ-Lẻ ---
    'numpar_oo_mono_inc': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-odd', 'monotonic_increasing'), minDays: 2 },
    'numpar_oo_arith_inc': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-odd', 'arithmetic_increasing'), minDays: 2 },
    'numpar_oo_mono_dec': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-odd', 'monotonic_decreasing'), minDays: 2 },
    'numpar_oo_arith_dec': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-odd', 'arithmetic_decreasing'), minDays: 2 },
    'numpar_oo_occur': { func: (data, start, end, days) => lotteryService.findParitySequenceNumbers(data, start, end, 'de', days, 'odd-odd', 'consecutive_occurrence'), minDays: 2 },
    
    'pht_head_even_mono_inc': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'even', 'monotonic_increasing'), minDays: 2 },
    'pht_head_even_arith_inc': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'even', 'arithmetic_increasing'), minDays: 2 },
    'pht_head_even_mono_dec': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'even', 'monotonic_decreasing'), minDays: 2 },
    'pht_head_even_arith_dec': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'even', 'arithmetic_decreasing'), minDays: 2 },
    'pht_head_even_occur': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'even', 'consecutive_occurrence'), minDays: 2 },
    'pht_head_odd_mono_inc': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'odd', 'monotonic_increasing'), minDays: 2 },
    'pht_head_odd_arith_inc': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'odd', 'arithmetic_increasing'), minDays: 2 },
    'pht_head_odd_mono_dec': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'odd', 'monotonic_decreasing'), minDays: 2 },
    'pht_head_odd_arith_dec': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'odd', 'arithmetic_decreasing'), minDays: 2 },
    'pht_head_odd_occur': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'head', 'odd', 'consecutive_occurrence'), minDays: 2 },
    'pht_tail_even_mono_inc': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'even', 'monotonic_increasing'), minDays: 2 },
    'pht_tail_even_arith_inc': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'even', 'arithmetic_increasing'), minDays: 2 },
    'pht_tail_even_mono_dec': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'even', 'monotonic_decreasing'), minDays: 2 },
    'pht_tail_even_arith_dec': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'even', 'arithmetic_decreasing'), minDays: 2 },
    'pht_tail_even_occur': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'even', 'consecutive_occurrence'), minDays: 2 },
    'pht_tail_odd_mono_inc': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'odd', 'monotonic_increasing'), minDays: 2 },
    'pht_tail_odd_arith_inc': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'odd', 'arithmetic_increasing'), minDays: 2 },
    'pht_tail_odd_mono_dec': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'odd', 'monotonic_decreasing'), minDays: 2 },
    'pht_tail_odd_arith_dec': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'odd', 'arithmetic_decreasing'), minDays: 2 },
    'pht_tail_odd_occur': { func: (data, start, end, days) => lotteryService.findParityHeadTailSequences(data, start, end, 'de', days, 'tail', 'odd', 'consecutive_occurrence'), minDays: 2 },

    'double_occur': { func: (data, start, end, days) => lotteryService.findConsecutiveDoubleNumbers(data, start, end, 'de', days, 'consecutive_occurrence'), minDays: 2 },
    'double_mono_inc': { func: (data, start, end, days) => lotteryService.findConsecutiveDoubleNumbers(data, start, end, 'de', days, 'monotonic_increasing'), minDays: 2 },
    'double_mono_dec': { func: (data, start, end, days) => lotteryService.findConsecutiveDoubleNumbers(data, start, end, 'de', days, 'monotonic_decreasing'), minDays: 2 },
    'double_arith_inc': { func: (data, start, end, days) => lotteryService.findConsecutiveDoubleNumbers(data, start, end, 'de', days, 'arithmetic_increasing'), minDays: 2 },
    'double_arith_dec': { func: (data, start, end, days) => lotteryService.findConsecutiveDoubleNumbers(data, start, end, 'de', days, 'arithmetic_decreasing'), minDays: 2 },
    'offset_double_occur': { func: (data, start, end, days) => lotteryService.findConsecutiveOffsetDoubleNumbers(data, start, end, 'de', days, 'consecutive_occurrence'), minDays: 2 },
    'offset_double_mono_inc': { func: (data, start, end, days) => lotteryService.findConsecutiveOffsetDoubleNumbers(data, start, end, 'de', days, 'monotonic_increasing'), minDays: 2 },
    'offset_double_mono_dec': { func: (data, start, end, days) => lotteryService.findConsecutiveOffsetDoubleNumbers(data, start, end, 'de', days, 'monotonic_decreasing'), minDays: 2 },
    'offset_double_arith_inc': { func: (data, start, end, days) => lotteryService.findConsecutiveOffsetDoubleNumbers(data, start, end, 'de', days, 'arithmetic_increasing'), minDays: 2 },
    'offset_double_arith_dec': { func: (data, start, end, days) => lotteryService.findConsecutiveOffsetDoubleNumbers(data, start, end, 'de', days, 'arithmetic_decreasing'), minDays: 2 },
    
    'evenHeadsGreaterThan4': { func: (data, start, end, days) => lotteryService.findEvenHeadsGreaterThan4(data, start, end, 'de', days), minDays: 2 },
    'evenHeadsLessThan4': { func: (data, start, end, days) => lotteryService.findEvenHeadsLessThan4(data, start, end, 'de', days), minDays: 2 },
    'evenTailsGreaterThan4': { func: (data, start, end, days) => lotteryService.findEvenTailsGreaterThan4(data, start, end, 'de', days), minDays: 2 },
    'evenTailsLessThan4': { func: (data, start, end, days) => lotteryService.findEvenTailsLessThan4(data, start, end, 'de', days), minDays: 2 },
    'oddHeadsGreaterThan5': { func: (data, start, end, days) => lotteryService.findOddHeadsGreaterThan5(data, start, end, 'de', days), minDays: 2 },
    'oddHeadsLessThan5': { func: (data, start, end, days) => lotteryService.findOddHeadsLessThan5(data, start, end, 'de', days), minDays: 2 },
    'oddTailsGreaterThan5': { func: (data, start, end, days) => lotteryService.findOddTailsGreaterThan5(data, start, end, 'de', days), minDays: 2 },
    'oddTailsLessThan5': { func: (data, start, end, days) => lotteryService.findOddTailsLessThan5(data, start, end, 'de', days), minDays: 2 },
    'headTail_0101': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '0101', days), minDays: 2 },
    'headTail_0100': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '0100', days), minDays: 2 },
    'headTail_0111': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '0111', days), minDays: 2 },
    'headTail_0110': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '0110', days), minDays: 2 },
    'headTail_0001': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '0001', days), minDays: 2 },
    'headTail_0000': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '0000', days), minDays: 2 },
    'headTail_0011': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '0011', days), minDays: 2 },
    'headTail_0010': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '0010', days), minDays: 2 },
    'headTail_1101': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '1101', days), minDays: 2 },
    'headTail_1100': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '1100', days), minDays: 2 },
    'headTail_1111': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '1111', days), minDays: 2 },
    'headTail_1110': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '1110', days), minDays: 2 },
    'headTail_1001': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '1001', days), minDays: 2 },
    'headTail_1000': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '1000', days), minDays: 2 },
    'headTail_1011': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '1011', days), minDays: 2 },
    'headTail_1010': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '1010', days), minDays: 2 },
    'headTail_401': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '401', days), minDays: 2 },
    'headTail_400': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '400', days), minDays: 2 },
    'headTail_411': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '411', days), minDays: 2 },
    'headTail_410': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '410', days), minDays: 2 },
    'headTail_501': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '501', days), minDays: 2 },
    'headTail_500': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '500', days), minDays: 2 },
    'headTail_511': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '511', days), minDays: 2 },
    'headTail_510': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '510', days), minDays: 2 },
    'headTail_014': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '014', days), minDays: 2 },
    'headTail_004': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '004', days), minDays: 2 },
    'headTail_114': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '114', days), minDays: 2 },
    'headTail_104': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '104', days), minDays: 2 },
    'headTail_015': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '015', days), minDays: 2 },
    'headTail_005': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '005', days), minDays: 2 },
    'headTail_115': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '115', days), minDays: 2 },
    'headTail_105': { func: (data, start, end, days) => lotteryService.findHeadAndTailStats(data, start, end, 'de', '105', days), minDays: 2 },
    
    // --- ĐẦU TO/NHỎ - ĐÍT TO/NHỎ ---
    'ht_size_bb_occur': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'consecutive_occurrence', 'big-big'), minDays: 2 },
    'ht_size_bb_mono_inc': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'monotonic_increasing', 'big-big'), minDays: 2 },
    'ht_size_bb_mono_dec': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'monotonic_decreasing', 'big-big'), minDays: 2 },
    'ht_size_bb_arith_inc': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'arithmetic_increasing', 'big-big'), minDays: 2 },
    'ht_size_bb_arith_dec': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'arithmetic_decreasing', 'big-big'), minDays: 2 },
    
    'ht_size_bs_occur': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'consecutive_occurrence', 'big-small'), minDays: 2 },
    'ht_size_bs_mono_inc': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'monotonic_increasing', 'big-small'), minDays: 2 },
    'ht_size_bs_mono_dec': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'monotonic_decreasing', 'big-small'), minDays: 2 },
    'ht_size_bs_arith_inc': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'arithmetic_increasing', 'big-small'), minDays: 2 },
    'ht_size_bs_arith_dec': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'arithmetic_decreasing', 'big-small'), minDays: 2 },
    
    'ht_size_sb_occur': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'consecutive_occurrence', 'small-big'), minDays: 2 },
    'ht_size_sb_mono_inc': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'monotonic_increasing', 'small-big'), minDays: 2 },
    'ht_size_sb_mono_dec': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'monotonic_decreasing', 'small-big'), minDays: 2 },
    'ht_size_sb_arith_inc': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'arithmetic_increasing', 'small-big'), minDays: 2 },
    'ht_size_sb_arith_dec': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'arithmetic_decreasing', 'small-big'), minDays: 2 },
    
    'ht_size_ss_occur': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'consecutive_occurrence', 'small-small'), minDays: 2 },
    'ht_size_ss_mono_inc': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'monotonic_increasing', 'small-small'), minDays: 2 },
    'ht_size_ss_mono_dec': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'monotonic_decreasing', 'small-small'), minDays: 2 },
    'ht_size_ss_arith_inc': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'arithmetic_increasing', 'small-small'), minDays: 2 },
    'ht_size_ss_arith_dec': { func: (data, start, end, days) => lotteryService.findHeadTailSizeSequences(data, start, end, 'de', days, 'arithmetic_decreasing', 'small-small'), minDays: 2 },
    
     // --- Các số cùng tổng ---
    'adv_sum_common_inc_trad': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_increasing', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_common_dec_trad': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_decreasing', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_common_inc_new': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_increasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_common_dec_new': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_decreasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_common_occur_trad': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_occurrence', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_common_occur_new': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_occurrence', sumType: 'new' }), minDays: 2 },
    'adv_sum_common_arith_inc_trad': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_arithmetic_increasing', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_common_arith_dec_trad': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_arithmetic_decreasing', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_common_arith_inc_new': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_arithmetic_increasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_common_arith_dec_new': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'common_sum_arithmetic_decreasing', sumType: 'new' }), minDays: 2 },
    // --- Các tổng khác nhau ---
    'adv_sum_seq_mono_inc_trad': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'monotonic_increasing', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_seq_mono_dec_trad': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'monotonic_decreasing', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_seq_arith_inc_trad': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'arithmetic_increasing', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_seq_arith_dec_trad': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'arithmetic_decreasing', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_seq_occur_trad': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'consecutive_occurrence', sumType: 'traditional' }), minDays: 2 },
    'adv_sum_seq_mono_inc_new': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'monotonic_increasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_seq_mono_dec_new': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'monotonic_decreasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_seq_arith_inc_new': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'arithmetic_increasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_seq_arith_dec_new': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'arithmetic_decreasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_seq_occur_new': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'consecutive_occurrence', sumType: 'new' }), minDays: 2 },
    
    'adv_sum_seq_mono_inc_new': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'monotonic_increasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_seq_mono_dec_new': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'monotonic_decreasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_seq_arith_inc_new': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'arithmetic_increasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_seq_arith_dec_new': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'arithmetic_decreasing', sumType: 'new' }), minDays: 2 },
    'adv_sum_seq_occur_new': { func: (d, s, e, days) => findAdvancedSumSequences(d, { startDate: s, endDate: e, mode: 'de', consecutiveDays: days, analysisType: 'sum', pattern: 'consecutive_occurrence', sumType: 'new' }), minDays: 2 },
    'sum_range_trad_1-2': { func: (data, start, end, days) => findTraditionalSumRangeSequences(data, start, end, 'de', days, '1-2'), minDays: 2 },
    'sum_range_trad_3-4': { func: (data, start, end, days) => findTraditionalSumRangeSequences(data, start, end, 'de', days, '3-4'), minDays: 2 },
    'sum_range_trad_5-6': { func: (data, start, end, days) => findTraditionalSumRangeSequences(data, start, end, 'de', days, '5-6'), minDays: 2 },
    'sum_range_trad_7-8': { func: (data, start, end, days) => findTraditionalSumRangeSequences(data, start, end, 'de', days, '7-8'), minDays: 2 },
    'sum_range_trad_9-10': { func: (data, start, end, days) => findTraditionalSumRangeSequences(data, start, end, 'de', days, '9-10'), minDays: 2 },
    'sum_range_new_0-3': { func: (data, start, end, days) => findSpecificSumRangeSequences(data, start, end, 'de', days, '0-3'), minDays: 2 },
    'sum_range_new_4-6': { func: (data, start, end, days) => findSpecificSumRangeSequences(data, start, end, 'de', days, '4-6'), minDays: 2 },
    'sum_range_new_7-9': { func: (data, start, end, days) => findSpecificSumRangeSequences(data, start, end, 'de', days, '7-9'), minDays: 2 },
    'sum_range_new_10-12': { func: (data, start, end, days) => findSpecificSumRangeSequences(data, start, end, 'de', days, '10-12'), minDays: 2 },
    'sum_range_new_13-15': { func: (data, start, end, days) => findSpecificSumRangeSequences(data, start, end, 'de', days, '13-15'), minDays: 2 },
    'sum_range_new_16-18': { func: (data, start, end, days) => findSpecificSumRangeSequences(data, start, end, 'de', days, '16-18'), minDays: 2 },
    'sum_sole_trad': { func: (data, start, end, days) => findSoleSumSequences(data, start, end, 'de', days, 'traditional', '0', 'ascending'), minDays: 3 },
    'sum_sole_new': { func: (data, start, end, days) => findSoleSumSequences(data, start, end, 'de', days, 'new', '0', 'ascending'), minDays: 3 },
    'sum_sole_pairs_new': { func: (data, start, end, days) => lotteryService.findNewSumSolePairs(data, start, end, 'de', days), minDays: 2 },
    // --- TỔNG CHẴN/LẺ (TRUYỀN THỐNG) ---
    'adv_sum_trad_even_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'even', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sum_trad_even_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'even', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sum_trad_even_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'even', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sum_trad_even_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'even', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sum_trad_even_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'even', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'adv_sum_trad_odd_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'odd', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sum_trad_odd_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'odd', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sum_trad_odd_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'odd', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sum_trad_odd_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'odd', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sum_trad_odd_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'traditional', sumParity: 'odd', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    
    // --- TỔNG CHẴN/LẺ (KIỂU MỚI) ---
    'adv_sum_new_even_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'even', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sum_new_even_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'even', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sum_new_even_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'even', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sum_new_even_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'even', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sum_new_even_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'even', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'adv_sum_new_odd_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'odd', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sum_new_odd_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'odd', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sum_new_odd_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'odd', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sum_new_odd_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'odd', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sum_new_odd_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum', sumType: 'new', sumParity: 'odd', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    
    // --- DẠNG CỦA TỔNG (0-18, KIỂU MỚI) ---
    'adv_sumpatt_ee_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-even', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sumpatt_ee_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-even', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sumpatt_ee_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-even', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sumpatt_ee_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-even', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'adv_sumpatt_ee_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-even', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sumpatt_eo_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-odd', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sumpatt_eo_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-odd', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sumpatt_eo_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-odd', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sumpatt_eo_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-odd', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'adv_sumpatt_eo_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'even-odd', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sumpatt_oe_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-even', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sumpatt_oe_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-even', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sumpatt_oe_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-even', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sumpatt_oe_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-even', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'adv_sumpatt_oe_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-even', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sumpatt_oo_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-odd', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sumpatt_oo_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-odd', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sumpatt_oo_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-odd', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sumpatt_oo_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-odd', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'adv_sumpatt_oo_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', numberParity: 'odd-odd', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sumpatt_trad_ee_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-even', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sumpatt_trad_ee_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-even', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sumpatt_trad_ee_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-even', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sumpatt_trad_ee_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-even', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'adv_sumpatt_trad_ee_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-even', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'adv_sumpatt_trad_eo_mono_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-odd', pattern: 'monotonic_increasing' }), minDays: 2 },
    'adv_sumpatt_trad_eo_arith_inc': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-odd', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'adv_sumpatt_trad_eo_mono_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-odd', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'adv_sumpatt_trad_eo_arith_dec': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-odd', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'adv_sumpatt_trad_eo_occur': { func: (data, start, end, days) => findAdvancedSumSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'sum_parity_pattern', sumType: 'traditional', numberParity: 'even-odd', pattern: 'consecutive_occurrence' }), minDays: 2 },
    
    // --- THỐNG KÊ HIỆU ---
    'diff_common_occur': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_difference', pattern: 'consecutive_occurrence' }), minDays: 2 },
    'diff_common_mono_inc': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_difference', pattern: 'monotonic_increasing' }), minDays: 2 },
    'diff_common_mono_dec': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_difference', pattern: 'monotonic_decreasing' }), minDays: 2 },
    'diff_common_arith_inc': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_difference', pattern: 'arithmetic_increasing' }), minDays: 2 },
    'diff_common_arith_dec': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'common_difference', pattern: 'arithmetic_decreasing' }), minDays: 2 },
    'diff_seq_mono_inc': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'monotonic_increasing', diffParity: 'any' }), minDays: 2 },
    'diff_seq_mono_dec': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'monotonic_decreasing', diffParity: 'any' }), minDays: 2 },
    'diff_seq_arith_inc': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'arithmetic_increasing', diffParity: 'any' }), minDays: 2 },
    'diff_seq_arith_dec': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'arithmetic_decreasing', diffParity: 'any' }), minDays: 2 },
    'diff_even_mono_inc': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'monotonic_increasing', diffParity: 'even' }), minDays: 2 },
    'diff_even_mono_dec': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'monotonic_decreasing', diffParity: 'even' }), minDays: 2 },
    'diff_even_arith_inc': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'arithmetic_increasing', diffParity: 'even' }), minDays: 2 },
    'diff_even_arith_dec': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'arithmetic_decreasing', diffParity: 'even' }), minDays: 2 },
    'diff_even_occur': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'consecutive_occurrence', diffParity: 'even' }), minDays: 2 },
    'diff_odd_mono_inc': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'monotonic_increasing', diffParity: 'odd' }), minDays: 2 },
    'diff_odd_mono_dec': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'monotonic_decreasing', diffParity: 'odd' }), minDays: 2 },
    'diff_odd_arith_inc': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'arithmetic_increasing', diffParity: 'odd' }), minDays: 2 },
    'diff_odd_arith_dec': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'arithmetic_decreasing', diffParity: 'odd' }), minDays: 2 },
    'diff_odd_occur': { func: (data, start, end, days) => lotteryService.findDifferenceSequences(data, { startDate: start, endDate: end, mode: 'de', consecutiveDays: days, analysisType: 'difference_sequence', pattern: 'consecutive_occurrence', diffParity: 'odd' }), minDays: 2 },

};

const getOverallStats = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).json({ message: 'Lỗi: Không thể tải dữ liệu xổ số.' });

    try {
        const overallStats = {}; 
        const startDate = lotteryService.getEarliestDate(data);
        const endDate = lotteryService.getCurrentDate();

        //console.log("Bắt đầu chạy Thống kê tổng hợp nhanh (Chế độ đầy đủ)...");

        const allStatPromises = Object.entries(statFunctionsMap).map(async ([statName, statInfo]) => {
            try {
                if (typeof statInfo.func !== 'function') {
                    return [statName, { recordRuns: [], secondPlaceRuns: [], recordLength: 0, secondPlaceLength: 0 }];
                }

                const resultsByLength = {};
                let maxN = 0;
                for (let n = statInfo.minDays || 2; n <= 30; n++) {
                    const { results } = statInfo.func(data, startDate, endDate, n);
                    if (results && results.length > 0) {
                        resultsByLength[n] = results;
                        maxN = n;
                    } else {
                        break;
                    }
                }
                
                // [SỬA LỖI] - Gửi về toàn bộ mảng các chuỗi kỷ lục, không chỉ cái cuối cùng
                const statResult = {
                    recordRuns: resultsByLength[maxN] || [],
                    secondPlaceRuns: resultsByLength[maxN - 1] || [],
                    recordLength: maxN,
                    secondPlaceLength: maxN > 1 ? maxN - 1 : 0
                };
                return [statName, statResult];

            } catch (error) {
                console.error(`--- LỖI KHI XỬ LÝ THỐNG KÊ: ${statName} ---`, error);
                return [statName, { recordRuns: [], secondPlaceRuns: [], recordLength: 0, secondPlaceLength: 0 }];
            }
        });

        const allStatResults = await Promise.all(allStatPromises);

        allStatResults.forEach(([statName, statResult]) => {
            overallStats[statName] = statResult;
        });

        //console.log("Hoàn thành Thống kê tổng hợp nhanh.");

        const recentStreaksData = lotteryService.analyzeCurrentStreaks(data, statFunctionsMap);
        const suggestedStreaks = suggestionService.generateSuggestions(recentStreaksData, overallStats);

        res.json({
            overallStats: overallStats,
            recentStreaks: suggestedStreaks,
        });

    } catch (error) {
        console.error('Lỗi nghiêm trọng trong getOverallStats:', error);
        res.status(500).json({ message: 'Lỗi server khi xử lý yêu cầu thống kê tổng hợp.' });
    }
};
// ================================================================
// PHẦN CONTROLLER CHO CÁC CHỨC NĂNG RIÊNG LẺ (GIỮ NGUYÊN)
// Bạn có thể sao chép toàn bộ các hàm controller riêng lẻ từ file cũ vào đây
// Ví dụ:
// ================================================================
const getCommonParams = (req) => {
    const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
    const endDate = req.query.endDate || lotteryService.getCurrentDate();
    const mode = req.query.mode || 'lo';
    const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 2;
    return { startDate, endDate, mode, consecutiveDays };
};

const getConsecutivePairs = async (req, res) => {
    const data = req.lotteryData;

    if (!data) {
        return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
    }

    try {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 2;

        const { results, total, message } = lotteryService.findConsecutivePairs(
            data,
            startDate,
            endDate,
            mode,
            consecutiveDays
        ) || { results: [], total: 0, message: 'Không có dữ liệu từ service.' };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('consecutivePairs', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } catch (error) {
        console.error('Lỗi trong getConsecutivePairs:', error);
        res.status(500).send('Lỗi server khi xử lý yêu cầu.');
    }
};

const getConsecutiveHeads = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findConsecutiveNumbers(data, startDate, endDate, 'head', mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('consecutiveHeads', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getConsecutiveTails = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findConsecutiveNumbers(data, startDate, endDate, 'tail', mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('consecutiveTails', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getAlternatingNumberPairs = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
    try {
        const { startDate, endDate, mode } = getCommonParams(req);
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 3;
        const sortOrder = req.query.sortOrder || 'desc';

        const { results, total, message } = lotteryService.findAlternatingNumberPairs(data, startDate, endDate, mode, consecutiveDays);

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('alternatingNumberPairs', { 
            title: 'Thống kê số về so le theo cặp', 
            results, 
            startDate, 
            endDate, 
            mode, 
            consecutiveDays, 
            total, 
            message, 
            sortOrder,
            formatDate: lotteryService.formatDate 
        });
    } catch (error) {
        console.error('Lỗi trong getAlternatingNumberPairs:', error);
        res.status(500).send('Lỗi server khi xử lý yêu cầu.');
    }
};

const getAlternatingHeads = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 4;

        const { results, total, message } = lotteryService.findAlternatingNumbers(data, startDate, endDate, 'head', mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('alternatingHeads', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getAlternatingTails = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 4;

        const { results, total, message } = lotteryService.findAlternatingNumbers(data, startDate, endDate, 'tail', mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('alternatingTails', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getParityHeadTailSequences = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).send('Lỗi tải dữ liệu.');

    try {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 3;
        const sortOrder = req.query.sortOrder || 'desc';
        const type = req.query.type;
        const parity = req.query.parity;
        const pattern = req.query.pattern;

        const createTitle = () => {
            let title = `Thống kê ${type === 'head' ? 'đầu' : 'đít'} ${parity === 'even' ? 'chẵn' : 'lẻ'} `;
            switch(pattern) {
                case 'monotonic_increasing': title += 'tăng dần'; break;
                case 'monotonic_decreasing': title += 'giảm dần'; break;
                case 'arithmetic_increasing': title += 'tăng dần ĐỀU'; break;
                case 'arithmetic_decreasing': title += 'giảm dần ĐỀU'; break;
                case 'consecutive_occurrence': title += 'về liên tiếp'; break;
            }
            return title;
        };
        const title = createTitle();

        const { results, total, message } = lotteryService.findParityHeadTailSequences(data, startDate, endDate, mode, consecutiveDays, type, parity, pattern);
        
        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('parityHeadTailSequences', { 
            title, results, total, message, 
            startDate, endDate, mode, consecutiveDays, sortOrder, type, parity, pattern,
            formatDate: lotteryService.formatDate 
        });
    } catch (error) {
        console.error('Lỗi trong getParityHeadTailSequences:', error);
        res.status(500).send('Lỗi server.');
    }
};

const getConsecutiveDoubleNumbers = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).send('Lỗi tải dữ liệu.');
    try {
        const { startDate, endDate, mode, consecutiveDays, sortOrder } = req.query;
        const pattern = req.query.pattern || 'consecutive_occurrence';

        const titleMap = {
            'consecutive_occurrence': 'Số kép về liên tiếp',
            'monotonic_increasing': 'Số kép tăng dần',
            'monotonic_decreasing': 'Số kép giảm dần',
            'arithmetic_increasing': 'Số kép tăng dần ĐỀU',
            'arithmetic_decreasing': 'Số kép giảm dần ĐỀU',
        };

        const { results, total, message } = lotteryService.findConsecutiveDoubleNumbers(data, startDate, endDate, mode, parseInt(consecutiveDays), pattern);
        
        res.render('sequenceResultPage', {
            title: `Thống kê ${titleMap[pattern]}`,
            results, total, message,
            options: { startDate, endDate, mode, consecutiveDays, pattern, sortOrder },
            formatDate: lotteryService.formatDate
        });
    } catch (error) {
        res.status(500).send('Lỗi server.');
    }
};

// [THAY THẾ HÀM CŨ]
const getConsecutiveOffsetDoubleNumbers = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).send('Lỗi tải dữ liệu.');
    try {
        const { startDate, endDate, mode, consecutiveDays, sortOrder } = req.query;
        const pattern = req.query.pattern || 'consecutive_occurrence';

        const titleMap = {
            'consecutive_occurrence': 'Số kép lệch về liên tiếp',
            'monotonic_increasing': 'Số kép lệch tăng dần',
            'monotonic_decreasing': 'Số kép lệch giảm dần',
            'arithmetic_increasing': 'Số kép lệch tăng dần ĐỀU',
            'arithmetic_decreasing': 'Số kép lệch giảm dần ĐỀU',
        };

        const { results, total, message } = lotteryService.findConsecutiveOffsetDoubleNumbers(data, startDate, endDate, mode, parseInt(consecutiveDays), pattern);
        
        res.render('sequenceResultPage', {
            title: `Thống kê ${titleMap[pattern]}`,
            results, total, message,
            options: { startDate, endDate, mode, consecutiveDays, pattern, sortOrder },
            formatDate: lotteryService.formatDate
        });
    } catch (error) {
        res.status(500).send('Lỗi server.');
    }
};

const getEvenHeadsGreaterThan4 = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findEvenHeadsGreaterThan4(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('evenHeadsGreaterThan4', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getEvenHeadsLessThan4 = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findEvenHeadsLessThan4(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('evenHeadsLessThan4', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getEvenTailsGreaterThan4 = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findEvenTailsGreaterThan4(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('evenTailsGreaterThan4', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getEvenTailsLessThan4 = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findEvenTailsLessThan4(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('evenTailsLessThan4', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getOddHeadsGreaterThan5 = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findOddHeadsGreaterThan5(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('oddHeadsGreaterThan5', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getOddHeadsLessThan5 = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findOddHeadsLessThan5(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('oddHeadsLessThan5', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getOddTailsGreaterThan5 = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findOddTailsGreaterThan5(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('oddTailsGreaterThan5', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getOddTailsLessThan5 = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findOddTailsLessThan5(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('oddTailsLessThan5', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getHeadAndTailStats = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const n = req.query.n || '0101';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findHeadAndTailStats(data, startDate, endDate, mode, n, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('headAndTailStats', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            n,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getConsecutiveSum = async (req, res) => {
    const data = req.lotteryData;
    if (!data) {
        return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
    }

    try {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;
        const sumType = req.query.sumType || 'traditional';

        const { results, total, message } = lotteryService.findConsecutiveSum(
            data,
            startDate,
            endDate,
            mode,
            consecutiveDays,
            sumType
        ) || { results: [], total: 0, message: 'Không có dữ liệu từ service.' };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        const formatNumber = (num) => {
            if (num === null || num === undefined || isNaN(num)) return "00";
            const numericValue = Number(num) % 100;
            return String(numericValue).padStart(2, "0");
        };

        res.render('consecutiveSum', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            sumType,
            formatDate: lotteryService.formatDate,
            formatNumber,
            total,
            message
        });
    } catch (error) {
        console.error('Lỗi trong getConsecutiveSum:', error);
        const formatNumber = (num) => {
            if (num === null || num === undefined || isNaN(num)) return "00";
            const numericValue = Number(num) % 100;
            return String(numericValue).padStart(2, "0");
        };
        res.render('consecutiveSum', {
            results: [],
            startDate: req.query.startDate || lotteryService.getDefaultStartDate(),
            endDate: req.query.endDate || lotteryService.getCurrentDate(),
            sortOrder: req.query.sortOrder || 'desc',
            mode: req.query.mode || 'de',
            consecutiveDays: parseInt(req.query.consecutiveDays) || 2,
            sumType: req.query.sumType || 'traditional',
            formatDate: lotteryService.formatDate,
            formatNumber,
            total: 0,
            message: 'Đã xảy ra lỗi khi xử lý yêu cầu.'
        });
    }
};

const getSumGreaterThan5Consecutive6Days = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 6;

        const { results, total, message } = lotteryService.findSumGreaterThan5Consecutive6Days(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('sumGreaterThan5', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getSumLessThan5Consecutive6Days = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 6;

        const { results, total, message } = lotteryService.findSumLessThan5Consecutive6Days(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('sumLessThan5', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getSumEqualTo5Consecutive3Days = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays) || 2;

        const { results, total, message } = lotteryService.findSumEqualTo5Consecutive3Days(data, startDate, endDate, mode, consecutiveDays) || { results: [], total: 0, message: "" };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        res.render('sumEqualTo5', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            total,
            message
        });
    } else {
        res.status(500).send('Lỗi khi tải dữ liệu.');
    }
};

const getIncreasingHeads = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const { startDate, endDate, mode, consecutiveDays, sortOrder } = req.query;
        const pattern = req.query.pattern || 'monotonic';
        const { results, total, message } = lotteryService.findIncreasingNumbers(data, startDate || lotteryService.getDefaultStartDate(), endDate || lotteryService.getCurrentDate(), 'head', mode || 'de', parseInt(consecutiveDays) || 2, pattern);
        results.sort((a, b) => new Date(a.dates[0]) - new Date(b.dates[0]) * (sortOrder === 'desc' ? -1 : 1));

        res.render('headTailSequence', {
            title: `Thống kê đầu số tăng ${pattern === 'arithmetic' ? 'đều' : 'dần'}`,
            results, total, message, startDate, endDate, mode, consecutiveDays, pattern, sortOrder,
            type: 'head',
            direction: 'increasing',
            formatDate: lotteryService.formatDate
        });
    } else { res.status(500).send('Lỗi khi tải dữ liệu.'); }
};

const getDecreasingHeads = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const { startDate, endDate, mode, consecutiveDays, sortOrder } = req.query;
        const pattern = req.query.pattern || 'monotonic';
        const { results, total, message } = lotteryService.findDecreasingNumbers(data, startDate || lotteryService.getDefaultStartDate(), endDate || lotteryService.getCurrentDate(), 'head', mode || 'de', parseInt(consecutiveDays) || 2, pattern);
        results.sort((a, b) => new Date(a.dates[0]) - new Date(b.dates[0]) * (sortOrder === 'desc' ? -1 : 1));

        res.render('headTailSequence', {
            title: `Thống kê đầu số lùi ${pattern === 'arithmetic' ? 'đều' : 'dần'}`,
            results, total, message, startDate, endDate, mode, consecutiveDays, pattern, sortOrder,
            type: 'head',
            direction: 'decreasing',
            formatDate: lotteryService.formatDate
        });
    } else { res.status(500).send('Lỗi khi tải dữ liệu.'); }
};

const getIncreasingTails = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const { startDate, endDate, mode, consecutiveDays, sortOrder } = req.query;
        const pattern = req.query.pattern || 'monotonic';
        const { results, total, message } = lotteryService.findIncreasingNumbers(data, startDate || lotteryService.getDefaultStartDate(), endDate || lotteryService.getCurrentDate(), 'tail', mode || 'de', parseInt(consecutiveDays) || 2, pattern);
        results.sort((a, b) => new Date(a.dates[0]) - new Date(b.dates[0]) * (sortOrder === 'desc' ? -1 : 1));

        res.render('headTailSequence', {
            title: `Thống kê đít số tăng ${pattern === 'arithmetic' ? 'đều' : 'dần'}`,
            results, total, message, startDate, endDate, mode, consecutiveDays, pattern, sortOrder,
            type: 'tail',
            direction: 'increasing',
            formatDate: lotteryService.formatDate
        });
    } else { res.status(500).send('Lỗi khi tải dữ liệu.'); }
};

const getDecreasingTails = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const { startDate, endDate, mode, consecutiveDays, sortOrder } = req.query;
        const pattern = req.query.pattern || 'monotonic';
        const { results, total, message } = lotteryService.findDecreasingNumbers(data, startDate || lotteryService.getDefaultStartDate(), endDate || lotteryService.getCurrentDate(), 'tail', mode || 'de', parseInt(consecutiveDays) || 2, pattern);
        results.sort((a, b) => new Date(a.dates[0]) - new Date(b.dates[0]) * (sortOrder === 'desc' ? -1 : 1));

        res.render('headTailSequence', {
            title: `Thống kê đít số lùi ${pattern === 'arithmetic' ? 'đều' : 'dần'}`,
            results, total, message, startDate, endDate, mode, consecutiveDays, pattern, sortOrder,
            type: 'tail',
            direction: 'decreasing',
            formatDate: lotteryService.formatDate
        });
    } else { res.status(500).send('Lỗi khi tải dữ liệu.'); }
};

const getConsecutiveIncreasingNumbers = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 2;
        const pattern = req.query.pattern || 'monotonic';
        const sortOrder = req.query.sortOrder || 'desc';

        const { results, total, message } = lotteryService.findConsecutiveIncreasingNumbers(data, startDate, endDate, mode, consecutiveDays, pattern);
        results.sort((a, b) => (new Date(a.dates[0]) - new Date(b.dates[0])) * (sortOrder === 'desc' ? -1 : 1));

        res.render('consecutiveNumbers', {
            title: `Thống kê các số tiến ${pattern === 'arithmetic' ? 'đều' : 'dần'}`,
            results, total, message, startDate, endDate, mode, consecutiveDays, pattern, sortOrder,
            formatDate: lotteryService.formatDate
        });
    } else { res.status(500).send('Lỗi khi tải dữ liệu.'); }
};

const getConsecutiveDecreasingNumbers = async (req, res) => {
    const data = req.lotteryData;
    if (data) {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 2;
        const pattern = req.query.pattern || 'monotonic';
        const sortOrder = req.query.sortOrder || 'desc';

        const { results, total, message } = lotteryService.findConsecutiveDecreasingNumbers(data, startDate, endDate, mode, consecutiveDays, pattern);
        results.sort((a, b) => (new Date(a.dates[0]) - new Date(b.dates[0])) * (sortOrder === 'desc' ? -1 : 1));

        res.render('consecutiveNumbers', {
            title: `Thống kê các số lùi ${pattern === 'arithmetic' ? 'đều' : 'dần'}`,
            results, total, message, startDate, endDate, mode, consecutiveDays, pattern, sortOrder,
            formatDate: lotteryService.formatDate
        });
    } else { res.status(500).send('Lỗi khi tải dữ liệu.'); }
};

const getParitySequenceNumbers = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).send('Lỗi tải dữ liệu.');

    try {
        const { 
            startDate = lotteryService.getDefaultStartDate(), 
            endDate = lotteryService.getCurrentDate(), 
            parityType = 'even-odd', 
            mode = 'de', 
            consecutiveDays = 2, 
            sortOrder = 'desc',
            pattern = 'monotonic_increasing' // Tham số mới
        } = req.query;

        // Tạo tiêu đề động
        const createTitle = () => {
            const parityMap = { 'even-even': 'Chẵn - Chẵn', 'even-odd': 'Chẵn - Lẻ', 'odd-even': 'Lẻ - Chẵn', 'odd-odd': 'Lẻ - Lẻ' };
            let title = `Thống kê Số dạng ${parityMap[parityType]} `;
            switch(pattern) {
                case 'monotonic_increasing': title += 'Tăng dần'; break;
                case 'monotonic_decreasing': title += 'Giảm dần'; break;
                case 'arithmetic_increasing': title += 'Tăng dần đều'; break;
                case 'arithmetic_decreasing': title += 'Giảm dần đều'; break;
                case 'consecutive_occurrence': title += 'Về liên tiếp'; break;
            }
            return title;
        };
        const title = createTitle();

        const { results, total, message } = lotteryService.findParitySequenceNumbers(data, startDate, endDate, mode, parseInt(consecutiveDays), parityType, pattern);
        results.sort((a, b) => (new Date(a.dates[0]) - new Date(b.dates[0])) * (sortOrder === 'desc' ? -1 : 1));

        res.render('paritySequenceNumbers', {
            title, results, total, message,
            startDate, endDate, parityType, mode, consecutiveDays, sortOrder, pattern,
            formatDate: lotteryService.formatDate
        });
    } catch (error) {
        console.error('Lỗi trong getParitySequenceNumbers:', error);
        res.status(500).send('Lỗi server.');
    }
};

const getSoleSumSequences = async (req, res) => {
    const data = req.lotteryData;
    if (!data) {
        return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
    }

    try {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 3;
        const sumType = req.query.sumType === 'new' ? 'new' : 'traditional';

        const { results, total, message } = findSoleSumSequences(
            data,
            startDate,
            endDate,
            mode,
            consecutiveDays,
            sumType
        ) || { results: [], total: 0, message: 'Không có dữ liệu từ service.' };

        // Sắp xếp kết quả theo ngày
        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        // Format functions
        const formatNumber = (num) => {
            if (num === null || num === undefined || isNaN(num)) return "00";
            const numericValue = Number(num) % 100;
            return String(numericValue).padStart(2, "0");
        };

        res.render('soleSumSequences', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            sumType,
            formatDate: lotteryService.formatDate,
            formatNumber,
            total,
            message
        });
    } catch (error) {
        console.error('Lỗi trong getSoleSumSequences:', error);
        res.render('soleSumSequences', {
            results: [],
            startDate: req.query.startDate || lotteryService.getDefaultStartDate(),
            endDate: req.query.endDate || lotteryService.getCurrentDate(),
            sortOrder: req.query.sortOrder || 'desc',
            mode: req.query.mode || 'de',
            consecutiveDays: parseInt(req.query.consecutiveDays, 10) || 3,
            sumType: req.query.sumType === 'new' ? 'new' : 'traditional',
            formatDate: lotteryService.formatDate,
            formatNumber: (num) => String(Number(num) % 100).padStart(2, "0"),
            total: 0,
            message: 'Đã xảy ra lỗi khi xử lý yêu cầu: ' + error.message
        });
    }
};

const getSpecificSumRangeSequences = async (req, res) => {
    const data = req.lotteryData;
    if (!data) {
        return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
    }

    try {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 2;
        const sumRange = req.query.sumRange || '0-3';

        const { findSpecificSumRangeSequences } = require('../utils/sumRangeAnalyzer');
        const { results, total, message } = findSpecificSumRangeSequences(
            data,
            startDate,
            endDate,
            mode,
            consecutiveDays,
            sumRange
        ) || { results: [], total: 0, message: 'Không có dữ liệu từ service.' };

        // Sắp xếp kết quả theo ngày
        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        // Format functions
        const formatNumber = (num) => {
            if (num === null || num === undefined || isNaN(num)) return "00";
            const numericValue = Number(num) % 100;
            return String(numericValue).padStart(2, "0");
        };

        res.render('specificSumRangeSequences', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            sumRange,
            formatDate: lotteryService.formatDate,
            formatNumber,
            total,
            message
        });
    } catch (error) {
        console.error('Lỗi trong getSpecificSumRangeSequences:', error);
        res.render('specificSumRangeSequences', {
            results: [],
            startDate: req.query.startDate || lotteryService.getDefaultStartDate(),
            endDate: req.query.endDate || lotteryService.getCurrentDate(),
            sortOrder: req.query.sortOrder || 'desc',
            mode: req.query.mode || 'de',
            consecutiveDays: parseInt(req.query.consecutiveDays, 10) || 2,
            sumRange: req.query.sumRange || '0-3',
            formatDate: lotteryService.formatDate,
            formatNumber: (num) => String(Number(num) % 100).padStart(2, "0"),
            total: 0,
            message: 'Đã xảy ra lỗi khi xử lý yêu cầu: ' + error.message
        });
    }
};

const getTraditionalSumRangeSequences = async (req, res) => {
    const data = req.lotteryData;
    if (!data) {
        return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
    }

    try {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 2;
        const sumRange = req.query.sumRange || '1-2';

        const { findTraditionalSumRangeSequences } = require('../utils/traditionalSumRangeAnalyzer');
        const { results, total, message, rangeName } = findTraditionalSumRangeSequences(
            data,
            startDate,
            endDate,
            mode,
            consecutiveDays,
            sumRange
        ) || { results: [], total: 0, message: 'Không có dữ liệu từ service.', rangeName: '' };

        // Sắp xếp kết quả theo ngày
        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        // Format functions
        const formatNumber = (num) => {
            if (num === null || num === undefined || isNaN(num)) return "00";
            const numericValue = Number(num) % 100;
            return String(numericValue).padStart(2, "0");
        };

        res.render('traditionalSumRangeSequences', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            sumRange,
            rangeName,
            formatDate: lotteryService.formatDate,
            formatNumber,
            total,
            message
        });
    } catch (error) {
        console.error('Lỗi trong getTraditionalSumRangeSequences:', error);
        res.render('traditionalSumRangeSequences', {
            results: [],
            startDate: req.query.startDate || lotteryService.getDefaultStartDate(),
            endDate: req.query.endDate || lotteryService.getCurrentDate(),
            sortOrder: req.query.sortOrder || 'desc',
            mode: req.query.mode || 'de',
            consecutiveDays: parseInt(req.query.consecutiveDays, 10) || 2,
            sumRange: req.query.sumRange || '1-2',
            rangeName: '',
            formatDate: lotteryService.formatDate,
            formatNumber: (num) => String(Number(num) % 100).padStart(2, "0"),
            total: 0,
            message: 'Đã xảy ra lỗi khi xử lý yêu cầu: ' + error.message
        });
    }
};

const getScoringResults = async (req, res) => {
    try {
        const data = req.lotteryData;
        // === DÒNG MỚI: IMPORT scoringForms TẠI ĐÂY ===
        const { scoringForms } = require('../utils/lotteryScoring');

        if (!data) {
            return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
        }

        // --- NHIỆM VỤ 1: LUÔN LUÔN TÍNH TOÁN ĐIỂM TỔNG HỢP ---
        const currentYear = new Date().getFullYear();
        const aggStartDate = `${currentYear}-01-01`;
        const aggEndDate = lotteryService.getCurrentDate();
        const aggMode = 'de';

        const { results: aggregateResults } = lotteryScoring.calculateAggregateScoreForAllNumbers(data, aggStartDate, aggEndDate, aggMode);


        // --- NHIỆM VỤ 2: XỬ LÝ TÌM KIẾM TÙY CHỈNH (NẾU NGƯỜI DÙNG SUBMIT FORM) ---
        let formResults = {
            results: undefined,
            total: 0,
            message: 'Vui lòng chọn các tham số và nhấn "Tìm kiếm" để xem kết quả tùy chỉnh.',
            duplicates: {},
            searchType: 'occurrence'
        };
        
        const {
            startDate,
            endDate,
            mode,
            searchType,
            occurrenceCount,
            selectedForms,
            sortOrder
        } = req.query;

        if (startDate) {
             if (!lotteryService.isValidDate(startDate) || !lotteryService.isValidDate(endDate) || new Date(startDate) > new Date(endDate)) {
                 formResults.message = 'Lỗi: Ngày cung cấp không hợp lệ.';
             } else {
                let results = [];
                let duplicates = {};
                
                if (searchType === 'occurrence') {
                    const allResults = lotteryScoring.calculateAllLotteryScores(data, startDate, endDate, mode);
                    const count = parseInt(occurrenceCount, 10);
                    results = allResults.results.filter(r => r.occurrences === count);
                } else if (searchType === 'forms') {
                    const formsToSearch = selectedForms ? selectedForms.split(',') : [];
                    if (formsToSearch.length > 0) {
                         for (const form of formsToSearch) {
                             const singleFormResult = lotteryScoring.calculateLotteryScores(data, startDate, endDate, mode, form);
                             results = results.concat(singleFormResult.results);
                         }
                         duplicates = findDuplicateNumbers(results);
                    }
                }
                
                formResults = {
                    results,
                    total: results.length,
                    message: `Tìm thấy ${results.length} kết quả cho tìm kiếm của bạn.`,
                    duplicates,
                    searchType
                };
             }
        }
        
        // --- NHIỆM VỤ 3: RENDER VIEW VỚI TẤT CẢ DỮ LIỆU ĐÃ CHUẨN BỊ ---
        res.render('scoring-form', {
            results: formResults.results,
            total: formResults.total,
            message: formResults.message,
            duplicates: formResults.duplicates,
            searchType: formResults.searchType,

            aggregateResults: aggregateResults,
            aggStartDate: lotteryService.formatDate(aggStartDate),
            aggEndDate: lotteryService.formatDate(aggEndDate),
            aggMode: aggMode.toUpperCase(),

            // === DÒNG MỚI: GỬI scoringForms SANG VIEW ===
            scoringForms: scoringForms,

            startDate: startDate || lotteryService.getDefaultStartDate(),
            endDate: endDate || lotteryService.getCurrentDate(),
            mode: mode || 'de',
            occurrenceCount,
            selectedForms: selectedForms || '',
            sortOrder: sortOrder || 'score-asc',

            formatDate: lotteryService.formatDate
        });

    } catch (error) {
        console.error('Lỗi trong getScoringResults:', error);
        res.render('scoring-form', {
            results: undefined,
            aggregateResults: [],
            message: 'Đã xảy ra lỗi khi xử lý yêu cầu: ' + error.message,
            startDate: lotteryService.getDefaultStartDate(),
            endDate: lotteryService.getCurrentDate()
        });
    }
};

// Helper function to find duplicate numbers across different forms
function findDuplicateNumbers(results) {
    const numberToForms = {};
    const duplicates = {};
    
    // Build map of numbers to forms
    results.forEach(result => {
        if (result.dateToNumbers) {
            Object.values(result.dateToNumbers).forEach(numbers => {
                numbers.forEach(number => {
                    if (!numberToForms[number]) {
                        numberToForms[number] = new Set();
                    }
                    numberToForms[number].add(result.form);
                });
            });
        }
    });
    
    // Find numbers that appear in multiple forms
    Object.keys(numberToForms).forEach(number => {
        const forms = Array.from(numberToForms[number]);
        if (forms.length > 1) {
            duplicates[number] = forms;
        }
    });
    
    return duplicates;
}

const getNewSumSolePairs = async (req, res) => {
    const data = req.lotteryData;
    if (!data) {
        return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
    }

    try {
        const startDate = req.query.startDate || lotteryService.getDefaultStartDate();
        const endDate = req.query.endDate || lotteryService.getCurrentDate();
        const sortOrder = req.query.sortOrder || 'desc';
        const mode = req.query.mode || 'de';
        const consecutiveDays = parseInt(req.query.consecutiveDays, 10) || 3;

        const { results, total, message } = lotteryService.findNewSumSolePairs(
            data,
            startDate,
            endDate,
            mode,
            consecutiveDays
        ) || { results: [], total: 0, message: 'Không có dữ liệu từ service.' };

        results.sort((a, b) => {
            const dateA = new Date(a.dates[0]);
            const dateB = new Date(b.dates[0]);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        const formatNumber = (num) => {
            if (num === null || num === undefined || isNaN(num)) return "00";
            const numericValue = Number(num) % 100;
            return String(numericValue).padStart(2, "0");
        };

        res.render('newSumSolePairs', {
            results,
            startDate,
            endDate,
            sortOrder,
            mode,
            consecutiveDays,
            formatDate: lotteryService.formatDate,
            formatNumber,
            total,
            message
        });
    } catch (error) {
        console.error('Lỗi trong getNewSumSolePairs:', error);
        res.status(500).send('Lỗi server khi xử lý yêu cầu.');
    }
};

const getAbsenceStreaks = (req, res) => {
    const data = req.lotteryData;
    if (!data) {
        return res.status(500).send('Lỗi: Không thể tải dữ liệu xổ số.');
    }

    try {
        const absenceData = lotteryService.calculateAbsenceStreaks(data);
        
        // Sắp xếp kết quả theo chuỗi gan hiện tại giảm dần
        absenceData.sort((a, b) => b.currentStreak - a.currentStreak);

        res.render('absenceStreaks', {
            title: 'Thống kê Lô Gan (Chuỗi không về)',
            data: absenceData,
            formatDate: lotteryService.formatDate
        });
    } catch (error) {
        console.error('Lỗi trong getAbsenceStreaks:', error);
        res.status(500).send('Lỗi server khi xử lý yêu cầu.');
    }
};

const getPredictionPage = (req, res) => {
    const data = req.lotteryData;
    if (!data || data.length === 0) {
        return res.render('prediction', { title: 'Dự đoán Lô theo Lô', results: [], message: 'Không có dữ liệu để phân tích.', inputNumber: '', totalOccurrences: 0 });
    }

    let inputNumberStr = req.query.number;
    let analysisResults = [];
    let message = 'Nhập một số và nhấn "Phân tích" để xem kết quả.';
    let totalOccurrences = 0;
    let targetNumber;

    // Nếu không có số nào được nhập, mặc định lấy số đầu tiên trong danh sách Lô của ngày gần nhất
    if (inputNumberStr === undefined || inputNumberStr === '') {
        const latestDay = data[data.length - 1];
        
        // SỬA LỖI: Gọi hàm qua lotteryService và dùng mode 'lo'
        const numbersFromLatestDay = lotteryService.getNumbersByMode(latestDay, 'lo');
        targetNumber = numbersFromLatestDay[0]; // Lấy số đầu tiên trong danh sách lô (chính là giải đặc biệt)
        
        inputNumberStr = String(targetNumber).padStart(2, '0');
        message = `Phân tích mặc định cho số đầu tiên trong bảng kết quả ngày gần nhất: ${inputNumberStr}.`;
    } else {
        targetNumber = parseInt(inputNumberStr, 10);
    }

    // Chạy phân tích nếu có số hợp lệ
    if (!isNaN(targetNumber) && targetNumber >= 0 && targetNumber <= 99) {
        const { results, totalOccurrences: occurrences, message: msg } = lotteryService.analyzeNextDayOccurrences(data, targetNumber);
        analysisResults = results;
        totalOccurrences = occurrences;
        message = message.startsWith('Phân tích mặc định') ? `${message} ${msg}` : msg;
    } else {
        message = 'Vui lòng nhập một số hợp lệ từ 00 đến 99.';
    }

    res.render('prediction', {
        title: 'Phân tích Lô về theo Lô',
        results: analysisResults,
        message,
        inputNumber: inputNumberStr,
        totalOccurrences
    });
};

// File: lotteryController.js

// [THAY THẾ HÀM CŨ]
const getAdvancedSequences = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).send('Lỗi tải dữ liệu.');

    try {
        const options = {
            startDate: req.query.startDate || lotteryService.getDefaultStartDate(),
            endDate: req.query.endDate || lotteryService.getCurrentDate(),
            mode: req.query.mode || 'de',
            consecutiveDays: parseInt(req.query.consecutiveDays, 10) || 3,
            analysisType: req.query.analysisType || 'sum',
            sumType: req.query.sumType || 'traditional',
            sumParity: req.query.sumParity || 'any',
            numberParity: req.query.numberParity || 'even-even',
            pattern: req.query.pattern || 'monotonic_increasing'
        };

        const createTitle = () => {
            let title = 'Thống kê ';
            const sumTypeLabel = options.sumType === 'traditional' ? '(Truyền thống)' : '(Kiểu mới)';
            const patternMap = {
                'monotonic_increasing': 'Tăng dần',
                'monotonic_decreasing': 'Giảm dần',
                'arithmetic_increasing': 'Tăng dần ĐỀU',
                'arithmetic_decreasing': 'Giảm dần ĐỀU',
                'consecutive_occurrence': 'Về liên tiếp'
            };
            const patternLabel = patternMap[options.pattern] || '';

            if (options.analysisType.startsWith('common_sum')) {
                 title += `Các số Cùng tổng ${sumTypeLabel} - ${patternLabel}`;
            } else if (options.analysisType === 'sum') {
                let parityLabel = 'Các tổng';
                if (options.sumParity === 'even') parityLabel = 'Tổng Chẵn';
                if (options.sumParity === 'odd') parityLabel = 'Tổng Lẻ';
                title += `${parityLabel} ${sumTypeLabel} - ${patternLabel}`;
            } else if (options.analysisType === 'sum_parity_pattern') {
                const parityMap = {
                    'even-even': 'Chẵn - Chẵn', 'even-odd': 'Chẵn - Lẻ',
                    'odd-even': 'Lẻ - Chẵn', 'odd-odd': 'Lẻ - Lẻ'
                };
                const vietnameseParity = parityMap[options.numberParity] || options.numberParity;
                title += `Tổng dạng ${vietnameseParity} ${sumTypeLabel} - ${patternLabel}`;
            }
            return title;
        };
        
        const title = createTitle();
        const { results, total, message } = findAdvancedSumSequences(data, options);

        // [SỬA LỖI] - Thêm bước định dạng lại dữ liệu tại đây
        const formattedResults = results.map(r => ({
            ...r,
            results: r.results.map(d => ({ ...d, matched: d.extracted }))
        }));

        res.render('advancedResultPage', { 
            title, 
            results: formattedResults, // Gửi dữ liệu đã được định dạng
            total, 
            message, 
            options, 
            formatDate: lotteryService.formatDate 
        });

    } catch (error) {
        console.error('Lỗi trong getAdvancedSequences:', error);
        res.status(500).send('Lỗi server.');
    }
};
/**
 * [HÀM MỚI] - Controller cho thống kê Đầu/Đít To/Nhỏ
 */
const getHeadTailSizeSequences = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).send('Lỗi tải dữ liệu.');
    try {
        const options = {
            startDate: req.query.startDate || lotteryService.getDefaultStartDate(),
            endDate: req.query.endDate || lotteryService.getCurrentDate(),
            mode: req.query.mode || 'de',
            consecutiveDays: parseInt(req.query.consecutiveDays, 10) || 2,
            pattern: req.query.pattern || 'consecutive_occurrence',
            sizeType: req.query.sizeType || 'big-big'
        };

        const sizeTypeMap = {
            'big-big': 'Đầu To - Đít To',
            'big-small': 'Đầu To - Đít Nhỏ',
            'small-big': 'Đầu Nhỏ - Đít To',
            'small-small': 'Đầu Nhỏ - Đít Nhỏ',
        };
        
        const patternMap = {
            'consecutive_occurrence': 'Về liên tiếp',
            'monotonic_increasing': 'Tăng dần',
            'monotonic_decreasing': 'Giảm dần',
            'arithmetic_increasing': 'Tăng dần ĐỀU',
            'arithmetic_decreasing': 'Giảm dần ĐỀU',
        };
        const title = `Thống kê dạng ${sizeTypeMap[options.sizeType]} - ${patternMap[options.pattern]}`;

        const { results, total, message } = lotteryService.findHeadTailSizeSequences(data, options.startDate, options.endDate, options.mode, options.consecutiveDays, options.pattern, options.sizeType);
        
        // Đổi tên trường 'extracted' thành 'matched' để đồng bộ với template
        const formattedResults = results.map(result => ({
            ...result,
            results: result.results.map(dayResult => ({
                ...dayResult,
                matched: dayResult.extracted 
            }))
        }));

        // Sử dụng file view mới
        res.render('headTailSizeResultPage', {
            title,
            results: formattedResults,
            total,
            message,
            options, // Gửi toàn bộ object options
            formatDate: lotteryService.formatDate
        });
    } catch (error) {
        console.error('Lỗi trong getHeadTailSizeSequences:', error);
        res.status(500).send('Lỗi server.');
    }
};

// File: lotteryController.js

// [THAY THẾ HÀM CŨ]
const getDifferenceSequences = async (req, res) => {
    const data = req.lotteryData;
    if (!data) return res.status(500).send('Lỗi tải dữ liệu.');
    try {
        const options = {
            startDate: req.query.startDate || lotteryService.getDefaultStartDate(),
            endDate: req.query.endDate || lotteryService.getCurrentDate(),
            mode: req.query.mode || 'de',
            consecutiveDays: parseInt(req.query.consecutiveDays, 10) || 2,
            analysisType: req.query.analysisType || 'difference_sequence',
            pattern: req.query.pattern || 'monotonic_increasing',
            diffParity: req.query.diffParity || 'any'
        };

        // [SỬA LỖI] - Logic tạo tiêu đề được định nghĩa và gọi ngay tại đây
        const createTitle = () => {
            const patternMap = {
                'consecutive_occurrence': 'Về liên tiếp',
                'monotonic_increasing': 'Tăng dần',
                'monotonic_decreasing': 'Giảm dần',
                'arithmetic_increasing': 'Tăng dần ĐỀU',
                'arithmetic_decreasing': 'Giảm dần ĐỀU',
            };
            const patternLabel = patternMap[options.pattern] || '';

            if (options.analysisType === 'common_difference') {
                return `Thống kê Các số cùng Hiệu - ${patternLabel}`;
            } else {
                let parityLabel = 'Các Hiệu';
                if (options.diffParity === 'even') parityLabel = 'Hiệu Chẵn';
                if (options.diffParity === 'odd') parityLabel = 'Hiệu Lẻ';
                return `Thống kê ${parityLabel} - ${patternLabel}`;
            }
        };
        const title = createTitle(); // Gọi hàm nội bộ, không gọi từ service

        const { results, total, message } = lotteryService.findDifferenceSequences(data, options);
        const formattedResults = results.map(r => ({ ...r, results: r.results.map(d => ({ ...d, matched: d.extracted })) }));

        res.render('differenceResultPage', {
            title, results: formattedResults, total, message, options,
            formatDate: lotteryService.formatDate
        });
    } catch (error) {
        console.error('Lỗi trong getDifferenceSequences:', error);
        res.status(500).send('Lỗi server.');
    }
};

// EXPORTS TẤT CẢ CÁC HÀM CONTROLLER
module.exports = {
    getConsecutivePairs,
    getConsecutiveHeads,
    getConsecutiveTails,
    getAlternatingNumberPairs,
    getAlternatingHeads,
    getAlternatingTails,
    getParityHeadTailSequences,
    getConsecutiveDoubleNumbers,
    getConsecutiveOffsetDoubleNumbers,
    getEvenHeadsGreaterThan4,
    getEvenHeadsLessThan4,
    getEvenTailsGreaterThan4,
    getEvenTailsLessThan4,
    getOddHeadsGreaterThan5,
    getOddHeadsLessThan5,
    getOddTailsGreaterThan5,
    getOddTailsLessThan5,
    getHeadAndTailStats,
    getConsecutiveSum,
    getSumGreaterThan5Consecutive6Days,
    getSumLessThan5Consecutive6Days,
    getSumEqualTo5Consecutive3Days,
    getIncreasingHeads,
    getDecreasingHeads,
    getIncreasingTails,
    getDecreasingTails,
    getConsecutiveIncreasingNumbers,
    getConsecutiveDecreasingNumbers,
    getParitySequenceNumbers,
    getSoleSumSequences,
    getSpecificSumRangeSequences,
    getTraditionalSumRangeSequences,
    getScoringResults,
    getNewSumSolePairs,
    // Export hàm thống kê tổng hợp mới
    getOverallStats,
    getAbsenceStreaks,
    getPredictionPage,
    getAdvancedSequences,
    getHeadTailSizeSequences,
    getDifferenceSequences
};