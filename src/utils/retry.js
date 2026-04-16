const delay = (ms) => new Promise(res => setTimeout(res, ms));

export const retryAsync = async (fn, retries = 2, delayMs = 500) => {
    try {
        const result = await fn();

        // Detect supabase error atau error dari library lain
        if (result?.error) {
            throw new Error(result.error.message);
        }

        return result;

    } catch (err) {
        console.log(`RETRY REMAINING (${retries}):`, err.message);

        if (retries <= 0) throw err;

        await delay(delayMs);
        return retryAsync(fn, retries - 1, delayMs);
    }
};