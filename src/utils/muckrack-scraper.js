/**
 * Muck Rack scraper utilities
 */

/**
 * Extract profile URLs from search results page
 */
export async function extractProfileUrls(page) {
  return await page.$$eval('h5 > a[href^="/"]', (links) => {
    return links
      .map(link => {
        const href = link.getAttribute('href');
        // Only include profile links, not media outlet or podcast links
        if (href && !href.includes('/media-outlet/') && !href.includes('/podcast/')) {
          return `https://forager.muckrack.com${href}`;
        }
        return null;
      })
      .filter(url => url !== null);
  });
}

/**
 * Extract data from a single profile detail page
 */
export async function extractProfileData(page, debug = false) {
  try {
    const data = await page.evaluate((debug) => {
      // Debug logging function
      const debugLog = (step, data) => {
        if (debug) {
          console.log(`DEBUG [${step}]:`, data);
        }
      };

      // Helper function to get text content safely with debugging
      const getText = (selector, stepName = '') => {
        try {
          const el = document.querySelector(selector);
          const result = el ? el.textContent.trim() : '';
          // debugLog(stepName || `getText(${selector})`, { found: !!el, text: result });
          return result;
        } catch (error) {
          // debugLog(stepName || `getText(${selector}) ERROR`, error.message);
          return '';
        }
      };

      const getAttr = (selector, attr, stepName = '') => {
        try {
          const el = document.querySelector(selector);
          const result = el ? el.getAttribute(attr) : '';
          // debugLog(stepName || `getAttr(${selector}, ${attr})`, { found: !!el, value: result });
          return result;
        } catch (error) {
          // debugLog(stepName || `getAttr(${selector}, ${attr}) ERROR`, error.message);
          return '';
        }
      };

      // debugLog('START_EXTRACTION', 'Beginning profile data extraction');

      // Extract full name
      // debugLog('STEP_1', 'Extracting full name');
      const fullName = getText('h1', 'fullName');

      // Extract verification status
      // debugLog('STEP_2', 'Checking verification status');
      const isVerified = !!document.querySelector('h1 + .text-success, h1 .text-success');
      // debugLog('verification', { isVerified });

      // Extract title and outlets - look for the job items list (class mr-person-job-items or similar)
      // debugLog('STEP_3', 'Extracting title and outlets');
      let title = '';
      let outlets = [];
      let jobUl = document.querySelector('ul.mr-person-job-items'); // Declare in outer scope so it's accessible later for location extraction
      // debugLog('jobUl_search', { found: !!jobUl, selector: 'ul.mr-person-job-items' });

      // Find all job items
      if (jobUl) {
        const jobItems = jobUl.querySelectorAll('li');
        // debugLog('jobItems_found', { count: jobItems.length });
        
        jobItems.forEach((li, index) => {
          try {
            let jobText = li.textContent.trim();
            let outlet = li.querySelector('a')?.textContent?.trim() || '';
            jobText = jobText.replace(outlet, '').replace(',', '').trim();
            // debugLog(`jobItem_${index}`, { jobText, outlet });
            
            if (index === 0) {
              title = jobText;
            }
            if (outlet) {
              outlets.push(outlet);
            }
          } catch (error) {
            // debugLog(`jobItem_${index}_ERROR`, error.message);
          }
        });

        const otherOutletsSection = document.querySelector("body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.profile-section.profile-intro.mr-card > div.mr-card-content > div.row > div.col-9 > div > div.profile-details-item");
        // debugLog('otherOutletsSection', { found: !!otherOutletsSection });
        
        if (otherOutletsSection) {
          const otherOutletLinks = otherOutletsSection.querySelectorAll('a');
          // debugLog('otherOutletLinks', { count: otherOutletLinks.length });
          
          otherOutletLinks.forEach((link, index) => {
            try {
              const outletName = link.textContent.trim();
              if (outletName && !outlets.includes(outletName)) {
                outlets.push(outletName);
                // debugLog(`otherOutlet_${index}`, { outletName });
              }
            } catch (error) {
              // debugLog(`otherOutlet_${index}_ERROR`, error.message);
            }
          });
          
          outlets = Array.from(new Set(outlets));
          // debugLog('outlets_final', { count: outlets.length, outlets });
        }
      } else {
        // debugLog('jobUl_not_found', 'No job items found');
      }
      

      // Extract location - find text with pattern like "City, City, State"
      // debugLog('STEP_4', 'Extracting location');
      let location = '';
      let locationElm = document.querySelector('div.person-details-item.person-details-location');
      // debugLog('location_element', { found: !!locationElm });
      
      if (locationElm) {
        location = locationElm.textContent.replace('Location', '').trim();
        // debugLog('location_extracted', { location });
      }

      // Extract bio - appears after beats/outlets section, before action buttons
      // debugLog('STEP_5', 'Extracting bio');
      let bio = '';
      let bioElm = document.querySelector("body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-8 > div > div.profile-section.profile-intro.mr-card > div.mr-card-content > div.fs-5.fs-md-6.my-5");
      // debugLog('bio_element', { found: !!bioElm });
      
      if (bioElm) {
        bio = bioElm.textContent.trim();
        // debugLog('bio_extracted', { bioLength: bio.length, bioPreview: bio.substring(0, 100) });
      }

      // Extract beats/topics - only from visible beat links
      // debugLog('STEP_6', 'Extracting beats');
      const beatLinks = document.querySelectorAll('a[href*="/beat/"]');
      // debugLog('beat_links', { count: beatLinks.length });
      
      const beats = Array.from(beatLinks)
        .map((a, index) => {
          const text = a.textContent.trim();
          // debugLog(`beat_${index}`, { text, length: text.length });
          return text;
        })
        .filter(b => b && b.length < 50); // Filter out long text that might be menu items
      
      // debugLog('beats_final', { count: beats.length, beats });

      // Extract Twitter info
      let twitterHandle = '';
      let twitterFollowers = 0;
      let twitterPosts = 0;

      // Extract follower count
      const followerText = document.body.textContent;
      const followerMatch = followerText.match(/([\d,]+)\s+followers/);
      if (followerMatch) {
        twitterFollowers = parseInt(followerMatch[1].replace(/,/g, ''));
      }

      // Extract post count
      const postMatch = followerText.match(/([\d,]+)\s+X posts/);
      if (postMatch) {
        twitterPosts = parseInt(postMatch[1].replace(/,/g, ''));
      }

      // Extract email - look for buttons containing @ symbol
      let email = '';
      const allButtons = document.querySelectorAll('button');
      for (const button of allButtons) {
        const text = button.textContent.trim();
        if (text.includes('@') && text.includes('.')) {
          // Validate it looks like an email
          const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
          if (emailMatch) {
            email = emailMatch[1];
            break;
          }
        }
      }
      let all_emails = [];
      let emails_refs = document.querySelectorAll('.mr-contact.text-break.js-icon-envelope.js-clipboard')
      all_emails = [...emails_refs].map(i => i.querySelector('button')?.textContent)
      all_emails = all_emails.filter(i => i && i.includes('@'));
      // Remove duplicates by converting to Set and back to array
      all_emails = [...new Set(all_emails)].join('; ');

      // If not found in button, look for email pattern in entire page
      if (!email) {
        const bodyText = document.body.textContent;
        const emailMatches = bodyText.match(/\b[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+\b/g);
        if (emailMatches && emailMatches.length > 0) {
          // Filter out common false positives and take the first valid one
          for (const match of emailMatches) {
            if (!match.includes('example.com') && !match.includes('muckrack.com')) {
              email = match;
              break;
            }
          }
        }
      }

      // Extract ALL online links from the "Online" section
      let linkedinUrl = '';
      let instagramHandle = '';
      let instagramUrl = '';
      let youtubeUrl = '';
      let website = '';
      let blogUrl = '';
      let facebookUrl = '';
      let threadsUrl = '';
      let tumblrUrl = '';
      let pinterestUrl = '';
      let flickrUrl = '';
      let tiktokUrl = '';
      let otherUrls = [];

      // Contact section
      // debugLog('STEP_8', 'Extracting social media links');
      let contactSection = document.querySelector('body > div.mr-body.mt-7.mb-7 > div > div:nth-child(2) > div.col-sm-4 > div > div.mr-profile-section.profile-contact.mr-card.d-none.d-sm-block');
      let onlineSection = null;
      // debugLog('contact_section', { found: !!contactSection });

      if (contactSection) {
        onlineSection = contactSection.querySelector("div.mr-card-content > div.profile-contact-social.profile-contact-divider");
        // debugLog('online_section', { found: !!onlineSection });
        const socialLinks = onlineSection?.querySelectorAll('a') || [];
        // debugLog('social_links', { count: socialLinks.length });
        
        socialLinks.forEach((link, index) => {
          try {
            const href = link.getAttribute('href');
            const title = link.getAttribute('data-bs-original-title') || link.textContent.trim();
            // debugLog(`social_link_${index}`, { href, title });
            
            if (href && href !== '#') {
            // Categorize by title attribute (or fallback to href matching)
            if (title?.includes('LinkedIn') || href.includes('linkedin.com')) {
              linkedinUrl = href;
            } else if (title?.includes('Instagram') || href.includes('instagram.com')) {
              instagramUrl = href;
              const match = href.match(/instagram\.com\/([^/?]+)/);
              if (match) {
                instagramHandle = match[1];
              }
            } else if (title?.includes('Blog')) {
              blogUrl = href;
            } else if (title?.includes('Website')) {
              website = href;
            } else if ((title?.includes('Twitter') || title?.includes('X (') || href.includes('twitter.com') || href.includes('x.com')) && !twitterHandle) {
              // if not already extracted
              const match = href.match(/twitter\.com\/intent\/user\?screen_name=([^&]+)/);
              if (match) {
                twitterHandle = match[1];
              } else {
                const simpleMatch = href.match(/twitter\.com\/([^/?]+)/);
                if (simpleMatch) {
                  twitterHandle = simpleMatch[1];
                }
              }
            } else if (title?.includes('Facebook') || href.includes('facebook.com')) {
              facebookUrl = href;
            } else if (title?.includes('YouTube') || href.includes('youtube.com') || href.includes('youtu.be')) {
              youtubeUrl = href;
            } else if (title?.includes('Threads') || href.includes('threads.net')) {
              threadsUrl = href;
            } else if (title?.includes('Tumblr') || href.includes('tumblr.com')) {
              tumblrUrl = href;
            } else if (title?.includes('Pinterest') || href.includes('pinterest.com')) {
              pinterestUrl = href;
            } else if (title?.includes('Flickr') || href.includes('flickr.com')) {
              flickrUrl = href;
            } else if (title?.includes('TikTok') || href.includes('tiktok.com')) {
              tiktokUrl = href;
            } else {
              // Unknown link - add to other URLs
              otherUrls.push(href);
            }
          }
          } catch (error) {
            // debugLog(`social_link_${index}_ERROR`, error.message);
          }
        });
      }

      // Extract profile photo
      let profilePhotoUrl = '';
      const profileImg = document.querySelector('img[alt*="on Muck Rack"]');
      if (profileImg) {
        profilePhotoUrl = profileImg.getAttribute('src');
      }

      const finalData = {
        fullName,
        isVerified,
        title,
        primaryOutlet: outlets[0] || '',
        otherOutlets: outlets.slice(1).join('; '),
        location,
        bio,
        twitterHandle,
        twitterFollowers,
        twitterPosts,
        email,
        all_emails,
        linkedinUrl,
        instagramHandle,
        instagramUrl,
        youtubeUrl,
        facebookUrl,
        threadsUrl,
        tumblrUrl,
        pinterestUrl,
        flickrUrl,
        tiktokUrl,
        blogUrl,
        website,
        otherUrls: otherUrls.join('; '),
        profilePhotoUrl,
        beats: beats.join('; '),
        profileUrl: window.location.href
      };

      // debugLog('EXTRACTION_COMPLETE', { 
      //   success: true,
      //   dataKeys: Object.keys(finalData),
      //   hasName: !!finalData.fullName,
      //   hasEmail: !!finalData.email,
      //   hasLinkedIn: !!finalData.linkedinUrl
      // });

      return finalData;
    }, debug);

    // Parse name into first and last
    const nameParts = data.fullName.split(' ');
    data.firstName = nameParts[0] || '';
    data.lastName = nameParts.slice(1).join(' ') || '';

    return data;
  } catch (error) {
    console.error('Error extracting profile data:', error.message);
    return null;
  }
}

/**
 * Check if there's a next page
 */
export async function hasNextPage(page) {
  return await page.evaluate(() => {
    const showMoreLink = document.querySelector('a[href*="page="]');
    if (showMoreLink && showMoreLink.textContent.includes('Show More')) {
      return true;
    }
    return false;
  });
}

/**
 * Click to load more results
 */
export async function loadMoreResults(page) {
  try {
    // Use Playwright's locator for better reliability
    const showMoreLink = page.locator('a:has-text("Show More")').first();
    const isVisible = await showMoreLink.isVisible().catch(() => false);

    if (isVisible) {
      await showMoreLink.click();
      // Wait for network to be idle after clicking
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2000); // Additional wait for DOM updates
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error loading more results:', error.message);
    return false;
  }
}
