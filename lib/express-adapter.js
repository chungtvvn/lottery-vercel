/**
 * Express-to-NextJS adapter
 * Cho phép sử dụng Express-style controllers (req, res) trong Next.js API routes
 */

/**
 * Wrap một Express handler để dùng trong Next.js
 * @param {Function} handler - Express-style handler (req, res) => {}
 * @param {Object} options - { method: 'GET'|'POST', loadData: true }
 */
function wrapHandler(handler, options = {}) {
    const { loadData = true } = options;

    return async function nextHandler(request) {
        const { NextResponse } = require('next/server');

        // Ensure data is loaded (lotteryService)
        if (loadData) {
            const lotteryService = require('./services/lotteryService');
            if (!lotteryService.getRawData()) {
                await lotteryService.loadRawData();
            }
        }

        // Build Express-compatible req
        const url = new URL(request.url);
        const query = Object.fromEntries(url.searchParams.entries());

        let body = null;
        if (request.method === 'POST' || request.method === 'PUT') {
            try {
                body = await request.json();
            } catch (e) {
                body = {};
            }
        }

        const req = {
            query,
            body,
            params: {}, // Will be overridden if needed
            method: request.method,
            url: request.url,
            headers: Object.fromEntries(request.headers.entries())
        };

        // Build Express-compatible res
        let statusCode = 200;
        let responseData = null;
        let sent = false;

        const res = {
            status(code) {
                statusCode = code;
                return res;
            },
            json(data) {
                if (!sent) {
                    responseData = data;
                    sent = true;
                }
                return res;
            },
            send(data) {
                if (!sent) {
                    responseData = data;
                    sent = true;
                }
                return res;
            }
        };

        try {
            await handler(req, res);
            if (sent) {
                return NextResponse.json(responseData, { status: statusCode });
            }
            return NextResponse.json({ error: 'No response' }, { status: 500 });
        } catch (error) {
            console.error('[API Error]', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    };
}

module.exports = { wrapHandler };
