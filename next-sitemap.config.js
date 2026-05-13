/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: 'https://prysmor.io',
  generateRobotsTxt: true,
  exclude: ['/dashboard', '/dashboard/*', '/sign-in', '/sign-up', '/api/*', '/panel-auth'],
  robotsTxtOptions: {
    policies: [
      { userAgent: '*', allow: '/' },
      { userAgent: '*', disallow: ['/dashboard', '/sign-in', '/sign-up', '/api', '/panel-auth'] },
    ],
  },
  additionalPaths: async (config) => [
    await config.transform(config, '/'),
    await config.transform(config, '/pricing'),
    await config.transform(config, '/privacy'),
    await config.transform(config, '/terms'),
    await config.transform(config, '/docs'),
    await config.transform(config, '/docs/install'),
    await config.transform(config, '/docs/install-panel'),
  ],
};
