export interface ScrapedJob {
  id: string | number;
  title: string;
  company: string;
  location: string;
  publishedAt: string;
  type: string;
  url: string;
  source: string;
}

export async function fetchFromGupy(keyword: string = 'desenvolvedor'): Promise<ScrapedJob[]> {
  try {
    const url = `https://portal.gupy.io/job-search/term=${encodeURIComponent(keyword)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!response.ok) return [];
    const html = await response.text();

    const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!scriptMatch) return [];

    const json = JSON.parse(scriptMatch[1]);
    const jobList = json?.props?.pageProps?.initialJobList?.data || [];

    return jobList.map((j: any) => {
      const isRemote = j.workplaceType === 'remote' || !j.city;
      const location = isRemote 
        ? 'Remoto' 
        : (j.city ? `${j.city}${j.state ? ' - ' + j.state : ''}` : 'Brasil');
      
      let type = 'CLT';
      if (j.type?.includes('internship') || j.type?.includes('estagio')) type = 'Estágio';
      else if (j.type?.includes('pj') || j.type?.includes('contractor')) type = 'PJ';

      return {
        id: `gupy-${j.id || Math.random()}`,
        title: j.name || 'Vaga Sem Título',
        company: j.careerPageName || 'Empresa Confidencial',
        location,
        publishedAt: j.publishedDate || new Date().toISOString(),
        type,
        url: j.jobUrl || `https://portal.gupy.io/job-search/term=${encodeURIComponent(j.name || keyword)}`,
        source: 'Gupy'
      };
    });
  } catch (err) {
    console.error('Erro ao buscar vagas no Gupy:', err);
    return [];
  }
}

export async function fetchFromLinkedIn(keyword: string = 'desenvolvedor', locationQuery: string = 'Brasil'): Promise<ScrapedJob[]> {
  try {
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=${encodeURIComponent(locationQuery || 'Brasil')}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!response.ok) return [];
    const html = await response.text();

    const jobs: ScrapedJob[] = [];
    // Match job cards
    const cardRegex = /<div class="[^"]*job-search-card[^"]*"[^>]*>(.*?)<\/li>/gs;
    const cards = [...html.matchAll(cardRegex)];

    for (const card of cards) {
      const content = card[1] || card[0];
      const titleMatch = content.match(/<h3 class="base-search-card__title">\s*(.*?)\s*<\/h3>/s);
      const companyMatch = content.match(/<h4 class="base-search-card__subtitle">\s*(?:<a[^>]*>)?\s*(.*?)\s*(?:<\/a>)?\s*<\/h4>/s);
      const locationMatch = content.match(/<span class="job-search-card__location">\s*(.*?)\s*<\/span>/s);
      const linkMatch = content.match(/<a class="base-card__full-link[^"]*"\s+href="([^"]+)"/s);
      const timeMatch = content.match(/<time[^>]*datetime="([^"]+)"/s);

      if (titleMatch && titleMatch[1]) {
        const title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
        const company = companyMatch ? companyMatch[1].replace(/<[^>]+>/g, '').trim() : 'Empresa via LinkedIn';
        const location = locationMatch ? locationMatch[1].replace(/<[^>]+>/g, '').trim() : (locationQuery || 'Brasil');
        const url = linkMatch ? linkMatch[1].trim() : `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(title)}`;
        const publishedAt = timeMatch ? new Date(timeMatch[1]).toISOString() : new Date().toISOString();

        jobs.push({
          id: `linkedin-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title,
          company,
          location,
          publishedAt,
          type: title.toLowerCase().includes('estágio') || title.toLowerCase().includes('intern') ? 'Estágio' : (title.toLowerCase().includes('pj') ? 'PJ' : 'CLT'),
          url,
          source: 'LinkedIn'
        });
      }
    }

    return jobs;
  } catch (err) {
    console.error('Erro ao buscar vagas no LinkedIn:', err);
    return [];
  }
}

export async function fetchFromRemotive(keyword: string = 'developer'): Promise<ScrapedJob[]> {
  try {
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(keyword)}&limit=15`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    const jobs = data?.jobs || [];

    return jobs.slice(0, 15).map((j: any) => ({
      id: `remotive-${j.id}`,
      title: j.title || 'Vaga Remota',
      company: j.company_name || 'Tech Company',
      location: j.candidate_required_location || 'Remoto Global',
      publishedAt: j.publication_date || new Date().toISOString(),
      type: j.job_type === 'contract' ? 'PJ' : 'CLT',
      url: j.url || 'https://remotive.com',
      source: 'Remotive'
    }));
  } catch (err) {
    console.error('Erro ao buscar no Remotive:', err);
    return [];
  }
}

export async function fetchFromArbeitnow(keyword: string = 'developer'): Promise<ScrapedJob[]> {
  try {
    const url = 'https://www.arbeitnow.com/api/job-board-api';
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    const jobs = data?.data || [];

    const lowerKey = keyword.toLowerCase();
    const filtered = jobs.filter((j: any) => 
      !keyword || 
      j.title?.toLowerCase().includes(lowerKey) || 
      j.description?.toLowerCase().includes(lowerKey)
    );

    return filtered.slice(0, 10).map((j: any) => ({
      id: `arbeitnow-${j.slug || Math.random()}`,
      title: j.title || 'Vaga Desenvolvedor',
      company: j.company_name || 'Empresa Parceira',
      location: j.remote ? 'Remoto' : (j.location || 'Híbrido'),
      publishedAt: new Date(j.created_at * 1000).toISOString(),
      type: 'CLT',
      url: j.url || 'https://www.arbeitnow.com',
      source: 'Arbeitnow'
    }));
  } catch (err) {
    console.error('Erro ao buscar no Arbeitnow:', err);
    return [];
  }
}

export async function aggregateAllJobs(keyword: string = 'desenvolvedor', location: string = 'Brasil'): Promise<ScrapedJob[]> {
  const [gupyJobs, linkedInJobs, remotiveJobs, arbeitnowJobs] = await Promise.allSettled([
    fetchFromGupy(keyword),
    fetchFromLinkedIn(keyword, location),
    fetchFromRemotive(keyword),
    fetchFromArbeitnow(keyword)
  ]);

  const allJobs: ScrapedJob[] = [];
  if (gupyJobs.status === 'fulfilled') allJobs.push(...gupyJobs.value);
  if (linkedInJobs.status === 'fulfilled') allJobs.push(...linkedInJobs.value);
  if (remotiveJobs.status === 'fulfilled') allJobs.push(...remotiveJobs.value);
  if (arbeitnowJobs.status === 'fulfilled') allJobs.push(...arbeitnowJobs.value);

  // Fallback garantido caso a rede local bloqueie todas as conexões
  if (allJobs.length === 0) {
    allJobs.push(
      {
        id: 'mock-1',
        title: `${keyword ? keyword.toUpperCase() : 'Desenvolvedor Full Stack'} Pleno/Sênior`,
        company: 'Nubank (Demonstração)',
        location: 'São Paulo / Remoto',
        publishedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        type: 'CLT',
        url: 'https://nubank.gupy.io/',
        source: 'Gupy'
      },
      {
        id: 'mock-2',
        title: 'Engenheiro de Software React & Node.js',
        company: 'Mercado Livre (Demonstração)',
        location: 'Remoto',
        publishedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        type: 'CLT',
        url: 'https://mercadolivre.gupy.io/',
        source: 'Gupy'
      },
      {
        id: 'mock-3',
        title: 'Frontend Developer (TypeScript / React)',
        company: 'Globo Tech (Demonstração)',
        location: 'Rio de Janeiro / Híbrido',
        publishedAt: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
        type: 'PJ',
        url: 'https://linkedin.com',
        source: 'LinkedIn'
      }
    );
  }

  // Deduplicate by title + company
  const seen = new Set<string>();
  const uniqueJobs = allJobs.filter(job => {
    const key = `${job.title.toLowerCase().trim()}|${job.company.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort newest first
  uniqueJobs.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return uniqueJobs;
}
