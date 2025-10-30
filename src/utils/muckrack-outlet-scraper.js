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

      // Extract description (paragraph after h1)
      let description = '';
      const paragraphs = document.querySelectorAll('p');
      for (const p of paragraphs) {
        const text = p.textContent.trim();
        // Skip short paragraphs and look for descriptive content
        if (text.length > 50 && !text.includes('Request update') && !text.includes('Share this page')) {
          description = text;
          break;
        }
      }
      debugLog('description', { descLength: description.length });

      // Extract outlet/podcast details - try podcast selectors first, then fallback to media outlet table
      let network = '';
      let language = '';
      let genre = '';
      let outletLocation = '';
      let domainAuthority = '';
      let scope = '';

      if (isPodcast) {
        // Try podcast-specific selectors first
        network = getText('body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > div > div:nth-child(2) > section:nth-child(1) > div.mr-podcast-intro-section-content > ul > li:nth-child(1) > div:nth-child(2) > a', 'network');
        language = getText('body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > div > div:nth-child(2) > section:nth-child(1) > div.mr-podcast-intro-section-content > ul > li:nth-child(2) > div.mr-podcast-detail-text', 'language');
        genre = getText('body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > div > div:nth-child(2) > section:nth-child(1) > div.mr-podcast-intro-section-content > ul > li:nth-child(4) > div.mr-podcast-detail-text', 'genre');
        outletLocation = getText('body > div.mr-body.my-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.mr-podcast-intro-content.mr-card > div > div:nth-child(2) > section:nth-child(1) > div.mr-podcast-intro-section-content > ul > li:nth-child(5) > div.mr-podcast-detail-text', 'outletLocation');
      } else {
        // Fallback to media outlet detail table
        const outletsTable = document.querySelector("body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.profile-section.profile-stats.mr-card");
        outletLocation = outletsTable.querySelector("div.mr-card-content.p-0 > table > tbody > tr:nth-child(3) > td")?.textContent.trim() || '';
        language = outletsTable.querySelector("div.mr-card-content.p-0 > table > tbody > tr:nth-child(2) > td")?.textContent?.replace(/\s+/g, ' ').trim() || '';
        domainAuthority = outletsTable.querySelector("div.mr-card-content.p-0 > table > tbody > tr:nth-child(6) > td")?.textContent.trim() || '';
        scope = outletsTable.querySelector("div.mr-card-content.p-0 > table > tbody > tr:nth-child(1) > td")?.textContent.trim() || '';
      }

      debugLog('outlet_details', { network, language, genre, outletLocation, domainAuthority, scope });

      // Extract contact information from the Contact section
      const contactSectionElm = document.querySelector("body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-4.d-none.d-sm-block > div > div.profile-section.profile-contact.mr-card.d-none.d-sm-block > div")
      let address = '';
      let phone = '';
      let email = '';
      let contactForm = '';

      const contactHeading = Array.from(contactSectionElm.querySelectorAll('h5')).find(h =>
        h.textContent.includes('Contact information')
      );

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

      const finalData = {
        outletName,
        outletType,
        isVerified,
        description,
        network,
        language,
        genre,
        outletLocation,
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
        scope
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
