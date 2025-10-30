/**
 * Muck Rack outlet scraper utilities
 */

/**
 * Extract outlet URLs from search results page
 * Captures both /podcast/ and /media-outlet/ URLs
 */
export async function extractOutletUrls(page) {
  return await page.$$eval('h5 > a[href^="/"]', (links) => {
    return links
      .map(link => {
        const href = link.getAttribute('href');
        // Include both media-outlet and podcast links (both are media outlets in Muck Rack)
        if (href && (href.includes('/media-outlet/') || href.includes('/podcast/'))) {
          return `https://forager.muckrack.com${href}`;
        }
        return null;
      })
      .filter(url => url !== null);
  });
}

/**
 * Extract data from a single outlet detail page
 */
export async function extractOutletData(page, _outletUrl, isPodcast = false, debug = false) {
  try {
    const data = await page.evaluate(({ isPodcast, debug }) => {
      // Debug logging function
      const debugLog = (step, data) => {
        if (debug) {
          console.log(`DEBUG [${step}]:`, data);
        }
      };

      // Helper function to get text content safely
      const getText = (selector, stepName = '') => {
        try {
          const el = document.querySelector(selector);
          const result = el ? el.textContent.trim() : '';
          return result;
        } catch (error) {
          return '';
        }
      };

      const getAttr = (selector, attr, stepName = '') => {
        try {
          const el = document.querySelector(selector);
          const result = el ? el.getAttribute(attr) : '';
          return result;
        } catch (error) {
          return '';
        }
      };

      debugLog('START_EXTRACTION', 'Beginning outlet data extraction');

      // Extract outlet name from h1

﻿
      const mainInfoCard = isPodcast ? document.querySelector("body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > section") : document.querySelector("body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.profile-section.profile-intro.mr-card");
      const outletNameElement = mainInfoCard.querySelector('h1');
      const outletName = outletNameElement ? outletNameElement.textContent.trim() : '';
      debugLog('outletName', { outletName });
      let website = '';

      // Extract outlet type (text right after h1)
      let outletTypeElm = mainInfoCard.querySelector('.fw-medium');
      let outletType = outletTypeElm ? outletTypeElm.textContent.trim() : '';
      let isVerified = false;
      // Look for text node or element immediately after h1
      if (outletNameElement && outletNameElement.nextSibling) {
        let sibling = outletNameElement.nextSibling;
        // Skip whitespace text nodes
        while (sibling && sibling.nodeType === 3 && !sibling.textContent.trim()) {
          sibling = sibling.nextSibling;
        }
        if (sibling) {
          const typeText = sibling.textContent ? sibling.textContent.trim() : '';
          if (typeText.toLowerCase().includes('verified')) {
            isVerified = true;
          }
          // Clean up multi-line data: replace line breaks and multiple spaces with single space
          outletType = outletType.replace(/\s+/g, ' ').trim();
        }
      }
      debugLog('outletType', { outletType, isVerified });

      // Extract description (prefer structured intro, fallback to longer paragraph)
      let description = '';

      if (!isPodcast) {
        const introSelector = "body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.profile-section.profile-intro.mr-card > div > div > div.flex-grow-1 > div.mt-4";
        const introEl = document.querySelector(introSelector);
        if (introEl) {
          description = introEl.textContent.trim();
        }
      } else {
        const podcastIntroSelector = "body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > section > div > div > div.flex-grow-1 > div.js-show-more";
        const podcastIntroEl = document.querySelector(podcastIntroSelector);
        if (podcastIntroEl) {
          description = podcastIntroEl.textContent.trim();
        }
      }

      if (!description) {
        const paragraphScope = mainInfoCard ? Array.from(mainInfoCard.querySelectorAll('p')) : Array.from(document.querySelectorAll('p'));
        for (const p of paragraphScope) {
          const text = p.textContent.trim();
          if (
            text.length > 50 &&
            !/request update/i.test(text) &&
            !/share this page/i.test(text)
          ) {
            description = text;
            break;
          }
        }
      }
      debugLog('description', { descLength: description.length });

      // Helper to normalize numeric stats like Similarweb UVM
      const extractIntegerFromText = (text = '') => {
        const digitsOnly = text.replace(/[^0-9]/g, '');
        if (!digitsOnly) {
          return '';
        }
        const parsed = parseInt(digitsOnly, 10);
        return Number.isNaN(parsed) ? '' : parsed;
      };

      // Extract outlet/podcast details - try podcast selectors first, then fallback to media outlet table
      let network = '';
      let language = '';
      let genre = '';
      let outletLocation = '';
      let domainAuthority = '';
      let scope = '';
      let mediaMarket = '';
      let uniqueVisitorsPerMonthSimilarweb = '';
      let frequency = '';
      let daysPublished = '';
      let country = '';

      if (isPodcast) {
        // Try podcast-specific selectors first
        network = getText('body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > div > div:nth-child(2) > section:nth-child(1) > div.mr-podcast-intro-section-content > ul > li:nth-child(1) > div:nth-child(2) > a', 'network');
        language = getText('body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > div > div:nth-child(2) > section:nth-child(1) > div.mr-podcast-intro-section-content > ul > li:nth-child(2) > div.mr-podcast-detail-text', 'language');
        genre = getText('body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > div > div:nth-child(2) > section:nth-child(1) > div.mr-podcast-intro-section-content > ul > li:nth-child(4) > div.mr-podcast-detail-text', 'genre');
        outletLocation = getText('body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > div > div:nth-child(2) > section:nth-child(1) > div.mr-podcast-intro-section-content > ul > li:nth-child(5) > div.mr-podcast-detail-text', 'outletLocation');
        country = outletLocation;
      } else {
        // Fallback to media outlet detail table
        const outletsTable = document.querySelector("body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.profile-section.profile-stats.mr-card");
        if (outletsTable) {
          const rows = outletsTable.querySelectorAll('table tbody tr');
          rows.forEach(row => {
            const headerEl = row.querySelector('th') || row.querySelector('td');
            const valueCells = row.querySelectorAll('td');
            const valueEl = valueCells.length > 0 ? valueCells[valueCells.length - 1] : null;

            if (!headerEl || !valueEl) {
              return;
            }

            const label = headerEl.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
            const value = valueEl.textContent.replace(/\s+/g, ' ').trim();

            if (!label) {
              return;
            }

            if (label.includes('scope')) {
              scope = value;
            } else if (label.includes('language')) {
              language = value;
            } else if (label.includes('country')) {
              country = value;
              outletLocation = value;
            } else if (label.includes('media market')) {
              mediaMarket = value;
            } else if (label.includes('similarweb uvm')) {
              const cleanedValue = extractIntegerFromText(value);
              uniqueVisitorsPerMonthSimilarweb = cleanedValue;
            } else if (label.includes('frequency')) {
              frequency = value;
            } else if (label.includes('days published')) {
              daysPublished = value;
            } else if (label.includes('domain authority')) {
              domainAuthority = value;
            }
          });
        }
      }

      debugLog('outlet_details', { network, language, genre, outletLocation, domainAuthority, scope, mediaMarket, uniqueVisitorsPerMonthSimilarweb, frequency, daysPublished, country });

      // Extract contact information from the Contact section
      const contactSectionElm = document.querySelector("body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-4.d-none.d-sm-block > div > div.profile-section.profile-contact.mr-card.d-none.d-sm-block > div")
      let address = '';
      let phone = '';
      let email = '';
      let contactForm = '';

      const contactHeading = contactSectionElm
        ? Array.from(contactSectionElm.querySelectorAll('h5')).find(h =>
            h.textContent.includes('Contact information')
          )
        : null;

      if (contactHeading) {
        const contactSection = contactHeading.parentElement;
        if (contactSection) {
          // Extract address
          const addressLink = contactSection.querySelector('a[href*="google.com/maps"]');
          if (addressLink) {
            address = addressLink.textContent.trim();
          }

          // Extract phone
          const phoneLink = contactSection.querySelector('a[href^="tel:"]');
          if (phoneLink) {
            phone = phoneLink.textContent.trim();
          }

          // Extract email
          const emailLink = contactSection.querySelector('a[href^="mailto:"]');
          if (emailLink) {
            email = emailLink.textContent.trim();
          } else {
            // Look for email pattern in text
            const textContent = contactSection.textContent;
            const emailMatch = textContent.match(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/);
            if (emailMatch && !emailMatch[0].includes('muckrack.com')) {
              email = emailMatch[0];
            }
          }

          // Extract contact form
          const formLink = contactSection.querySelector('a[href*="contact"]');
          if (formLink && formLink.textContent.toLowerCase().includes('contact form')) {
            contactForm = formLink.getAttribute('href') || '';
          }

          // Extract website if not already found
          if (!website) {
            const websiteLinks = contactSection.querySelectorAll("a.mr-contact.text-break.js-icon-link");
            websiteLinks.forEach(link => {
              const href = link.getAttribute('href');
              if (href && !href.includes('google.com/maps') && !href.includes('tel:') && !href.includes('mailto:')) {
                website = href;
              }
            });
          }
        }
      }
      debugLog('contact_info', { address, phone, email, contactForm });

      // Extract social media links from Social Media section
      let twitterUrl = '';
      let facebookUrl = '';
      let linkedinUrl = '';
      let instagramUrl = '';
      let youtubeUrl = '';

      const socialHeading = Array.from(document.querySelectorAll('h5')).find(h =>
        h.textContent.includes('Social Media')
      );

      if (socialHeading) {
        const socialSection = socialHeading.parentElement;
        if (socialSection) {
          const socialLinks = socialSection.querySelectorAll('a[href*="http"]');

          socialLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
              if (href.includes('twitter.com') || href.includes('x.com')) {
                twitterUrl = href;
              } else if (href.includes('facebook.com')) {
                facebookUrl = href;
              } else if (href.includes('linkedin.com')) {
                linkedinUrl = href;
              } else if (href.includes('instagram.com')) {
                instagramUrl = href;
              } else if (href.includes('youtube.com') || href.includes('youtu.be')) {
                youtubeUrl = href;
              }
            }
          });
        }
      }
      debugLog('social_media', { twitterUrl, facebookUrl, linkedinUrl, instagramUrl, youtubeUrl });

      // Extract audience metrics
      let listenership = '';
      let reviews = '';

      const metricsHeading = Array.from(document.querySelectorAll('h3')).find(h =>
        h.textContent.includes('Audience metrics')
      );

      if (metricsHeading) {
        const metricsList = metricsHeading.nextElementSibling;
        if (metricsList && metricsList.tagName === 'UL') {
          const items = metricsList.querySelectorAll('li');
          items.forEach(item => {
            const text = item.textContent.trim();
            if (text.includes('Listenership')) {
              listenership = text.replace('Listenership', '').trim();
            } else if (text.includes('Reviews')) {
              reviews = text.replace('Reviews', '').trim();
            }
          });
        }
      }
      debugLog('audience_metrics', { listenership, reviews });

      // Extract logo/image
      let logoUrl = '';
      const images = document.querySelectorAll('img');
      for (const img of images) {
        const alt = img.getAttribute('alt') || '';
        const src = img.getAttribute('src') || '';
        // Look for podcast/outlet logo (usually the first large image)
        if (alt.includes(outletName) || (src && !src.includes('avatar') && !src.includes('icon'))) {
          logoUrl = src;
          break;
        }
      }
      debugLog('logo', { logoUrl });

      // Extract creators/journalists
      let creators = [];
      const creatorsHeading = Array.from(document.querySelectorAll('h3')).find(h =>
        h.textContent.includes('Creators')
      );

      if (creatorsHeading) {
        let nextEl = creatorsHeading.nextElementSibling;
        while (nextEl) {
          if (nextEl.tagName === 'UL') {
            const creatorLinks = nextEl.querySelectorAll('a[href^="/"]');
            creatorLinks.forEach(link => {
              const href = link.getAttribute('href');
              if (href && !href.includes('/search') && !href.includes('#')) {
                const name = link.textContent.trim();
                // Remove follower counts
                const cleanName = name.replace(/\d+\s+(followers?|Verified)/gi, '').trim();
                if (cleanName && cleanName.length > 2 && cleanName.length < 100) {
                  creators.push(cleanName);
                }
              }
            });
            break;
          }
          nextEl = nextEl.nextElementSibling;
        }
      }
      creators = Array.from(new Set(creators)); // Remove duplicates
      debugLog('creators', { count: creators.length, creators });

      if (!outletLocation && country) {
        outletLocation = country;
      }
      if (!country && outletLocation) {
        country = outletLocation;
      }

      const finalData = {
        outletName,
        outletType,
        isVerified,
        description,
        network,
        language,
        genre,
        outletLocation,
        country,
        address,
        phone,
        email,
        contactForm,
        website,
        twitterUrl,
        facebookUrl,
        linkedinUrl,
        instagramUrl,
        youtubeUrl,
        logoUrl,
        listenership,
        reviews,
        creators: creators.slice(0, 20).join('; '), // Limit to first 20
        creatorCount: creators.length,
        outletUrl: window.location.href,
        domainAuthority,
        scope,
        mediaMarket,
        uniqueVisitorsPerMonthSimilarweb,
        frequency,
        daysPublished
      };

      debugLog('EXTRACTION_COMPLETE', {
        success: true,
        hasName: !!finalData.outletName,
        hasWebsite: !!finalData.website
      });

      return finalData;
    }, { isPodcast, debug });

    return data;
  } catch (error) {
    console.error('Error extracting outlet data:', error.message);
    return null;
  }
}
