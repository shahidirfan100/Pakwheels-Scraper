// Pakwheels Used Cars Scraper - CheerioCrawler with enhanced stealth
import { Actor, log } from 'apify';
import { CheerioCrawler, Dataset } from 'crawlee';

await Actor.init();

async function main() {
    try {
        const input = (await Actor.getInput()) || {};
        const {
            city = '',
            make = '',
            model = '',
            minPrice,
            maxPrice,
            minYear,
            maxYear,
            results_wanted: RESULTS_WANTED_RAW = 100,
            max_pages: MAX_PAGES_RAW = 20,
            startUrl,
            proxyConfiguration,
        } = input;

        const RESULTS_WANTED = Number.isFinite(+RESULTS_WANTED_RAW) ? Math.max(1, +RESULTS_WANTED_RAW) : 100;
        const MAX_PAGES = Number.isFinite(+MAX_PAGES_RAW) ? Math.max(1, +MAX_PAGES_RAW) : 20;

        const BASE_URL = 'https://www.pakwheels.com';

        /**
         * Build Pakwheels search URL from filters
         * 
         * PakWheels uses path-based URL format:
         * /used-cars/search/-/ct_lahore/mk_toyota/md_corolla/pr_1000000_5000000/yr_2015_2020/
         */
        function buildSearchUrl() {
            // Base path for search
            let pathParts = ['/used-cars/search/-'];

            // Add city filter: ct_lahore
            if (city) {
                const citySlug = city.toLowerCase().trim().replace(/\s+/g, '-');
                pathParts.push(`ct_${citySlug}`);
            }

            // Add make filter: mk_toyota
            if (make) {
                const makeSlug = make.toLowerCase().trim().replace(/\s+/g, '-');
                pathParts.push(`mk_${makeSlug}`);
            }

            // Add model filter: md_corolla
            if (model) {
                const modelSlug = model.toLowerCase().trim().replace(/\s+/g, '-');
                pathParts.push(`md_${modelSlug}`);
            }

            // Add price filter: pr_1000000_5000000 or pr_1000000_more
            if (minPrice || maxPrice) {
                const min = minPrice || '0';
                const max = maxPrice || 'more';
                pathParts.push(`pr_${min}_${max}`);
            }

            // Add year filter: yr_2015_2020
            if (minYear || maxYear) {
                const min = minYear || '1990';
                const max = maxYear || new Date().getFullYear();
                pathParts.push(`yr_${min}_${max}`);
            }

            // Build final URL with trailing slash
            const finalPath = pathParts.join('/') + '/';
            return `${BASE_URL}${finalPath}`;
        }

        /**
         * Extract car data from JSON-LD script tag (Priority 1)
         */
        function extractFromJsonLd($, listing) {
            const script = $(listing).find('script[type="application/ld+json"]');
            if (!script.length) return null;

            try {
                const data = JSON.parse(script.html() || '');
                if (data['@type'] !== 'Product') return null;

                return {
                    title: data.name || null,
                    price: data.offers?.price ? parseInt(data.offers.price, 10) : null,
                    currency: data.offers?.priceCurrency || 'PKR',
                    year: data.modelDate ? parseInt(data.modelDate, 10) : null,
                    mileage: data.mileageFromOdometer?.value || null,
                    fuel_type: data.fuelType || null,
                    brand: data.brand?.name || data.brand || null,
                };
            } catch {
                return null;
            }
        }

        /**
         * Extract car data from HTML (Priority 2 - Fallback)
         * Updated selectors based on browser verification:
         * - Card: li.classified-listing
         * - Title: a.car-name
         * - Price: .price-details
         * - Specs: ul.ad-specs li
         * - Location: ul.search-vehicle-info li
         */
        function extractFromHtml($, listing) {
            const $listing = $(listing);

            // Title and URL
            const titleLink = $listing.find('a.car-name');
            const title = titleLink.text().trim() || null;
            const href = titleLink.attr('href') || null;
            const url = href ? new URL(href, BASE_URL).href : null;

            // Price - extract from .price-details
            const priceText = $listing.find('.price-details').text().trim();
            const price = parsePrice(priceText);

            // Vehicle specs from ul.ad-specs li (Year, Mileage, Fuel, Engine, Transmission)
            const specs = $listing.find('ul.ad-specs li').map((_, el) => $(el).text().trim()).get();
            const year = specs[0] ? parseInt(specs[0], 10) : null;
            const mileage = specs[1] || null;
            const fuel_type = specs[2] || null;
            const engine_capacity = specs[3] || null;
            const transmission = specs[4] || null;

            // Location from ul.search-vehicle-info li
            const location = $listing.find('ul.search-vehicle-info li').first().text().trim() || null;

            // Image
            const img = $listing.find('img');
            const image_url = img.attr('data-original') || img.attr('data-src') || img.attr('src') || null;

            // Featured status
            const is_featured = $listing.hasClass('featured-listing') ||
                $listing.find('.featured-label, .featured').length > 0;

            // Updated time
            const updated_at = $listing.find('.search-bottom .pull-right, .updated-date').text().trim() || null;

            return {
                title,
                url,
                price,
                currency: 'PKR',
                year,
                mileage,
                fuel_type,
                engine_capacity,
                transmission,
                location,
                image_url: cleanImageUrl(image_url),
                is_featured,
                updated_at,
            };
        }

        /**
         * Parse price string to numeric value
         */
        function parsePrice(priceText) {
            if (!priceText) return null;

            // Extract numbers
            const numbers = priceText.match(/[\d.,]+/g);
            if (!numbers) return null;

            const cleaned = numbers[0].replace(/,/g, '');

            // Check for lacs/lakhs (1 lac = 100,000)
            if (/lacs?|lakhs?/i.test(priceText)) {
                const num = parseFloat(cleaned);
                return isNaN(num) ? null : Math.round(num * 100000);
            }

            // Check for crore (1 crore = 10,000,000)
            if (/crore/i.test(priceText)) {
                const num = parseFloat(cleaned);
                return isNaN(num) ? null : Math.round(num * 10000000);
            }

            // Regular number
            const num = parseInt(cleaned, 10);
            return isNaN(num) ? null : num;
        }

        /**
         * Clean image URL by removing query parameters
         */
        function cleanImageUrl(url) {
            if (!url) return null;
            try {
                const parsed = new URL(url);
                return `${parsed.origin}${parsed.pathname}`;
            } catch {
                return url;
            }
        }

        // Determine start URL
        const initialUrl = startUrl || buildSearchUrl();
        log.info(`Starting scrape from: ${initialUrl}`);

        const proxyConf = proxyConfiguration
            ? await Actor.createProxyConfiguration({ ...proxyConfiguration })
            : undefined;

        let saved = 0;
        const results = [];

        const crawler = new CheerioCrawler({
            proxyConfiguration: proxyConf,
            maxRequestRetries: 5,
            useSessionPool: true,
            persistCookiesPerSession: true,
            sessionPoolOptions: {
                maxPoolSize: 20,
                sessionOptions: {
                    maxUsageCount: 5,
                },
            },
            maxConcurrency: 2,
            requestHandlerTimeoutSecs: 120,
            navigationTimeoutSecs: 90,

            // Pre-navigation hook for stealth headers
            preNavigationHooks: [
                async ({ request }) => {
                    request.headers = {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Accept-Encoding': 'gzip, deflate, br',
                        'Cache-Control': 'no-cache',
                        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                        'Sec-Ch-Ua-Mobile': '?0',
                        'Sec-Ch-Ua-Platform': '"Windows"',
                        'Sec-Fetch-Dest': 'document',
                        'Sec-Fetch-Mode': 'navigate',
                        'Sec-Fetch-Site': 'none',
                        'Sec-Fetch-User': '?1',
                        'Upgrade-Insecure-Requests': '1',
                    };

                    // Random delay between requests
                    const delay = 2000 + Math.random() * 3000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                },
            ],

            async requestHandler({ request, $, enqueueLinks, session }) {
                const pageNo = request.userData?.pageNo || 1;

                // Debug: Log page title and body length
                const pageTitle = $('title').text();
                const bodyLength = $('body').html()?.length || 0;
                log.info(`Page ${pageNo}: Title="${pageTitle}", Body length=${bodyLength}`);

                // Try multiple selectors for listings
                let listings = $('li.classified-listing');

                if (listings.length === 0) {
                    // Try alternative selectors
                    listings = $('[class*="classified"]').filter('li');
                }

                if (listings.length === 0) {
                    // Try finding by car-name links
                    listings = $('a.car-name').closest('li');
                }

                log.info(`Page ${pageNo}: Found ${listings.length} car listings`);

                if (listings.length === 0) {
                    // Debug: Log some of the HTML to understand what we got
                    const bodyText = $('body').text().substring(0, 500);
                    log.warning(`No listings found. Page content preview: ${bodyText.substring(0, 200)}...`);

                    // Check for blocking indicators
                    if (bodyText.toLowerCase().includes('captcha') ||
                        bodyText.toLowerCase().includes('blocked') ||
                        bodyText.toLowerCase().includes('access denied') ||
                        bodyText.toLowerCase().includes('robot')) {
                        log.error('Page appears to be blocked');
                        session?.retire();
                        throw new Error('Blocked by website');
                    }
                    return;
                }

                // Process each listing
                for (let i = 0; i < listings.length && saved < RESULTS_WANTED; i++) {
                    const listing = listings[i];

                    // Try JSON-LD first (Priority 1)
                    let carData = extractFromJsonLd($, listing);

                    // Fallback to HTML parsing (Priority 2)
                    const htmlData = extractFromHtml($, listing);

                    // Merge data - prefer JSON-LD values but use HTML for missing fields
                    const merged = {
                        title: carData?.title || htmlData.title,
                        url: htmlData.url,
                        price: carData?.price || htmlData.price,
                        currency: carData?.currency || htmlData.currency,
                        year: carData?.year || htmlData.year,
                        mileage: carData?.mileage || htmlData.mileage,
                        fuel_type: carData?.fuel_type || htmlData.fuel_type,
                        engine_capacity: htmlData.engine_capacity,
                        transmission: htmlData.transmission,
                        location: htmlData.location,
                        image_url: htmlData.image_url,
                        is_featured: htmlData.is_featured,
                        updated_at: htmlData.updated_at,
                    };

                    // Only save if we have essential data
                    if (merged.title && merged.url) {
                        results.push(merged);
                        saved++;
                    }
                }

                // Push data in batches
                if (results.length >= 25 || saved >= RESULTS_WANTED) {
                    await Dataset.pushData(results.splice(0, results.length));
                    log.info(`Pushed batch. Total saved: ${saved}`);
                }

                // Pagination - find next page
                if (saved < RESULTS_WANTED && pageNo < MAX_PAGES && listings.length > 0) {
                    // Check for next page link
                    const nextLink = $('li.next_page a, a[rel="next"], .pagination .next a').attr('href');

                    if (nextLink) {
                        const nextUrl = new URL(nextLink, BASE_URL).href;
                        log.info(`Enqueueing next page: ${nextUrl}`);
                        await enqueueLinks({
                            urls: [nextUrl],
                            userData: { label: 'LIST', pageNo: pageNo + 1 },
                        });
                    } else {
                        // Manual pagination
                        const nextPage = pageNo + 1;
                        const url = new URL(request.url);
                        url.searchParams.set('page', String(nextPage));
                        log.info(`Enqueueing next page (manual): ${url.href}`);
                        await enqueueLinks({
                            urls: [url.href],
                            userData: { label: 'LIST', pageNo: nextPage },
                        });
                    }
                }
            },

            async failedRequestHandler({ request, session }, error) {
                log.error(`Request ${request.url} failed: ${error.message}`);
                session?.retire();
            },
        });

        await crawler.run([{ url: initialUrl, userData: { label: 'LIST', pageNo: 1 } }]);

        // Push any remaining results
        if (results.length > 0) {
            await Dataset.pushData(results);
        }

        log.info(`Scraping complete. Total cars saved: ${saved}`);
    } finally {
        await Actor.exit();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
