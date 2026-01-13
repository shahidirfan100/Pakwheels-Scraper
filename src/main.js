// Pakwheels Used Cars Scraper - CheerioCrawler implementation
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
         */
        function buildSearchUrl() {
            // Base search path
            let path = '/used-cars';

            // Add city if provided
            if (city) {
                path += `/${city.toLowerCase().trim()}`;
            }

            // Add make/model if provided
            if (make) {
                path += `/${make.toLowerCase().trim().replace(/\s+/g, '-')}`;
                if (model) {
                    path += `-${model.toLowerCase().trim().replace(/\s+/g, '-')}`;
                }
            }

            // Build URL
            const url = new URL(`${path}/`, BASE_URL);

            // Add price filters
            if (minPrice) url.searchParams.set('price_from', String(minPrice));
            if (maxPrice) url.searchParams.set('price_to', String(maxPrice));

            // Add year filters
            if (minYear) url.searchParams.set('year_from', String(minYear));
            if (maxYear) url.searchParams.set('year_to', String(maxYear));

            return url.href;
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
         */
        function extractFromHtml($, listing) {
            const $listing = $(listing);

            // Title and URL
            const titleLink = $listing.find('a.car-name.ad-detail-path');
            const title = titleLink.text().trim() || null;
            const href = titleLink.attr('href') || null;
            const url = href ? new URL(href, BASE_URL).href : null;

            // Price - extract numeric value
            const priceText = $listing.find('.price-details').text().trim();
            const price = parsePrice(priceText);

            // Vehicle specs from info list
            const specs = $listing.find('ul.search-vehicle-info-2 li').map((_, el) => $(el).text().trim()).get();
            const year = specs[0] ? parseInt(specs[0], 10) : null;
            const mileage = specs[1] || null;
            const fuel_type = specs[2] || null;
            const engine_capacity = specs[3] || null;
            const transmission = specs[4] || null;

            // Location
            const location = $listing.find('ul.search-vehicle-info li').first().text().trim() || null;

            // Image
            const img = $listing.find('.img-box img');
            const image_url = img.attr('data-original') || img.attr('src') || null;

            // Featured status
            const is_featured = $listing.hasClass('featured-listing') || $listing.find('.featured-label').length > 0;

            // Updated time
            const updated_at = $listing.find('.search-bottom .pull-right').text().trim() || null;

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
         * Handles formats like "PKR 12.5 lacs", "PKR 1.25 crore", "PKR 12,500,000"
         */
        function parsePrice(priceText) {
            if (!priceText) return null;

            const cleaned = priceText.replace(/[^\d.,]/gi, '').replace(/,/g, '');

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

        /**
         * Find next page URL
         */
        function findNextPage($, currentUrl, currentPage) {
            const nextPage = currentPage + 1;
            const url = new URL(currentUrl);
            url.searchParams.set('page', String(nextPage));
            return url.href;
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
            maxRequestRetries: 3,
            useSessionPool: true,
            maxConcurrency: 5,
            requestHandlerTimeoutSecs: 60,
            additionalMimeTypes: ['text/html'],

            async requestHandler({ request, $, enqueueLinks }) {
                const pageNo = request.userData?.pageNo || 1;

                // Find all car listings
                const listings = $('li.classified-listing');
                log.info(`Page ${pageNo}: Found ${listings.length} car listings`);

                if (listings.length === 0) {
                    log.warning('No listings found on page. HTML structure may have changed.');
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

                // Batch push every 25 items or when done
                if (results.length >= 25 || saved >= RESULTS_WANTED) {
                    await Dataset.pushData(results.splice(0, results.length));
                    log.info(`Pushed batch. Total saved: ${saved}`);
                }

                // Check for more pages
                if (saved < RESULTS_WANTED && pageNo < MAX_PAGES && listings.length > 0) {
                    const nextUrl = findNextPage($, request.url, pageNo);
                    await enqueueLinks({
                        urls: [nextUrl],
                        userData: { label: 'LIST', pageNo: pageNo + 1 },
                    });
                }
            },

            async failedRequestHandler({ request }, error) {
                log.error(`Request ${request.url} failed: ${error.message}`);
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
