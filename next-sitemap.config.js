/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://prysmor.io',
  generateRobotsTxt: true,
  generateIndexSitemap: false,
  additionalPaths: async (config) => [
    await config.transform(config, '/'),
    await config.transform(config, '/docs'),
    await config.transform(config, '/docs/install'),
  ],
  exclude: ['/dashboard', '/sign-in', '/sign-up', '/api/*', '/privacy', '/terms'],
  robotsTxtOptions: {
    policies: [
      { userAgent: '*', allow: '/' },
      { userAgent: '*', disallow: ['/dashboard', '/sign-in', '/sign-up', '/api'] },
    ],
  },
};
