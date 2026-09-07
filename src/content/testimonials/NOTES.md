# Testimonials are not fixtures

This collection is deliberately empty.

A testimonial is a claim that a named person said something about this business.
Writing a plausible one as scaffolding would put a fabricated review in the
content repo — and the crawl already found the live homepage rendering the
placeholder “Position, Company name” above a reviewer’s name, which is the
defect this collection exists to fix rather than to reproduce.

Real testimonials land in Phase 3 with the client’s material. The schema is in
src/content.config.ts: `name` is required and `role` and `company` are optional,
so a template can never need a placeholder for either.
