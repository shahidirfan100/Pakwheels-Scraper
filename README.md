# Pakwheels Scraper

Scrape used car listings from Pakwheels.com, Pakistan's largest automotive marketplace. Extract detailed car information including prices, specifications, mileage, and seller location.

## Features

- **Comprehensive Car Data** - Extract title, price, year, mileage, fuel type, engine capacity, transmission, and location
- **Flexible Filtering** - Filter by city, car make, model, price range, and year range
- **Accurate Pricing** - Get exact prices in Pakistani Rupees (PKR), not approximate values
- **Fast and Efficient** - Optimized for speed with intelligent pagination
- **Production Ready** - Reliable extraction with fallback mechanisms

## Use Cases

- Market research and price analysis for used cars in Pakistan
- Automotive inventory monitoring and competitor analysis
- Building car price comparison tools and databases
- Lead generation for automotive businesses
- Research on car depreciation and market trends

## Input Configuration

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `startUrl` | String | Direct Pakwheels search URL (overrides filters) | - |
| `city` | String | City filter (Lahore, Karachi, Islamabad, etc.) | - |
| `make` | String | Car manufacturer (Toyota, Honda, Suzuki, etc.) | - |
| `model` | String | Specific model (Corolla, Civic, City, etc.) | - |
| `minPrice` | Integer | Minimum price in PKR | - |
| `maxPrice` | Integer | Maximum price in PKR | - |
| `minYear` | Integer | Minimum model year | - |
| `maxYear` | Integer | Maximum model year | - |
| `results_wanted` | Integer | Maximum listings to collect | 100 |
| `max_pages` | Integer | Maximum pages to scrape | 20 |
| `proxyConfiguration` | Object | Apify proxy settings | Residential |

## Example Input

### Search by City

```json
{
  "city": "Lahore",
  "results_wanted": 50
}
```

### Search by Make and Model

```json
{
  "make": "Toyota",
  "model": "Corolla",
  "city": "Karachi",
  "results_wanted": 100
}
```

### Search with Price and Year Range

```json
{
  "city": "Islamabad",
  "minPrice": 2000000,
  "maxPrice": 5000000,
  "minYear": 2018,
  "maxYear": 2023,
  "results_wanted": 50
}
```

### Direct URL

```json
{
  "startUrl": "https://www.pakwheels.com/used-cars/toyota-corolla/lahore",
  "results_wanted": 100
}
```

## Output Data

Each car listing includes the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `title` | String | Car listing title (make, model, year) |
| `url` | String | Direct link to the listing |
| `price` | Integer | Price in PKR (exact value) |
| `currency` | String | Currency code (PKR) |
| `year` | Integer | Model year |
| `mileage` | String | Odometer reading |
| `fuel_type` | String | Petrol, Diesel, Hybrid, CNG, or Electric |
| `engine_capacity` | String | Engine displacement (cc) |
| `transmission` | String | Automatic or Manual |
| `location` | String | City where car is listed |
| `image_url` | String | Main listing image URL |
| `is_featured` | Boolean | Featured listing status |
| `updated_at` | String | Last update time |

## Sample Output

```json
{
  "title": "Toyota Corolla 2020 Altis Grande CVT 1.8",
  "url": "https://www.pakwheels.com/used-cars/toyota-corolla-2020-for-sale-in-lahore-12345678",
  "price": 5850000,
  "currency": "PKR",
  "year": 2020,
  "mileage": "45,000 km",
  "fuel_type": "Petrol",
  "engine_capacity": "1800 cc",
  "transmission": "Automatic",
  "location": "Lahore",
  "image_url": "https://cache1.pakwheels.com/ad_pictures/abc123.jpg",
  "is_featured": false,
  "updated_at": "2 hours ago"
}
```

## Supported Cities

Lahore, Karachi, Islamabad, Rawalpindi, Peshawar, Faisalabad, Multan, Gujranwala, and all other cities listed on Pakwheels.

## Supported Car Makes

Toyota, Honda, Suzuki, Hyundai, KIA, Daihatsu, Nissan, Mercedes, BMW, Audi, and all other makes available on Pakwheels.

## Tips for Best Results

1. **Use city filter** - Narrow down results to specific cities for faster scraping
2. **Combine filters** - Use make + model + city for targeted searches
3. **Set reasonable limits** - Use `results_wanted` to control output size
4. **Price in PKR** - All prices are returned as exact integers in Pakistani Rupees

## Integrations

Export your data in multiple formats:
- JSON
- CSV
- Excel
- XML

Connect the scraper output to:
- Google Sheets
- Airtable
- Webhooks
- Slack notifications
- Email alerts

## Cost Estimation

The scraper is optimized for efficiency:
- ~25 listings per page
- Average run: 0.5-2 minutes for 100 listings
- Minimal platform compute usage

## Support

For issues, questions, or feature requests, please contact the developer or open an issue on the repository.

---

*This scraper is designed for legitimate research and data collection purposes. Please respect Pakwheels.com terms of service and use responsibly.*