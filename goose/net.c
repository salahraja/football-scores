/* The C under goose/fetch.goose: one HTTPS GET to football-data.org through the system's libcurl.
   Goose can't bind libcurl itself (setopt is variadic and the body arrives through a callback), so this file does the request
   and hands back one flat buffer. The token is read here, from FOOTBALL_DATA_TOKEN, and sent only as the X-Auth-Token header:
   Goose code never holds it. C owns the buffer; Goose copies it with ffi::bytes and then calls fd_free. */
#include <curl/curl.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef struct { char *p; size_t n; } buf;

static size_t on_data(char *d, size_t s, size_t m, void *u) {
    buf *b = u;
    size_t k = s * m;
    if (b->n + k > 64u << 20) return 0; /* a reply over 64 MB is not football-data.org's */
    char *q = realloc(b->p, b->n + k + 1);
    if (!q) return 0;
    b->p = q; memcpy(q + b->n, d, k); b->n += k; q[b->n] = 0;
    return k;
}

int64_t fd_has_token(void) {
    const char *t = getenv("FOOTBALL_DATA_TOKEN");
    return t && *t ? 1 : 0;
}

/* GET https://api.football-data.org/v4<path>. Returns the body (0 if the request failed before a reply), with *status the HTTP code
   (0 = no reply) and *retry_after the Retry-After seconds (-1 if absent). */
uint64_t fd_get(const char *path, int64_t *status, int64_t *retry_after, int64_t *len) {
    *status = 0; *retry_after = -1; *len = 0;
    const char *token = getenv("FOOTBALL_DATA_TOKEN");
    if (!token || !*token || strlen(token) > 200 || strpbrk(token, "\r\n")) return 0;
    char url[512], header[256];
    if (snprintf(url, sizeof url, "https://api.football-data.org/v4%s", path) >= (int)sizeof url) return 0;
    snprintf(header, sizeof header, "X-Auth-Token: %s", token);
    CURL *c = curl_easy_init();
    if (!c) return 0;
    struct curl_slist *h = curl_slist_append(NULL, header);
    buf b = {0, 0};
    curl_easy_setopt(c, CURLOPT_URL, url);
    curl_easy_setopt(c, CURLOPT_HTTPHEADER, h);
    curl_easy_setopt(c, CURLOPT_WRITEFUNCTION, on_data);
    curl_easy_setopt(c, CURLOPT_WRITEDATA, &b);
    curl_easy_setopt(c, CURLOPT_TIMEOUT, 15L);
    curl_easy_setopt(c, CURLOPT_PROTOCOLS_STR, "https");
    curl_easy_setopt(c, CURLOPT_USERAGENT, "football-scores");
    CURLcode r = curl_easy_perform(c);
    long code = 0;
    curl_off_t wait = -1;
    if (r == CURLE_OK) {
        curl_easy_getinfo(c, CURLINFO_RESPONSE_CODE, &code);
        if (curl_easy_getinfo(c, CURLINFO_RETRY_AFTER, &wait) != CURLE_OK || wait <= 0) wait = -1;
    }
    curl_slist_free_all(h);
    memset(header, 0, sizeof header);
    curl_easy_cleanup(c);
    if (r != CURLE_OK) { free(b.p); return 0; }
    *status = code; *retry_after = (int64_t)wait; *len = (int64_t)b.n;
    if (!b.p) b.p = calloc(1, 1);
    return (uint64_t)(uintptr_t)b.p;
}

void fd_free(uint64_t p) { free((void *)(uintptr_t)p); }
