# Where these came from

Three Google reviews, transcribed from the review rail the live Webflow site
renders on every page. They are the only testimonials the shop publishes, and
they are reproduced as their authors wrote them: no grammar was corrected, and
the one reviewer who spells the business as one word still does.

Two things were changed, both typographic. Straight apostrophes became ’ so the
copy passes the same lint as the rest of the repo, and the double spaces
Google’s export carries between sentences were collapsed to one.

`role` and `company` are absent on all three, which is the point of their
being optional. The live site rendered the literal string “Position, Company
name” above every reviewer — a placeholder nobody filled in — and a schema that
cannot express “this reviewer did not give a job title” is a schema that
guarantees the placeholder comes back.

`date` is absent because the live markup does not carry one; Google shows a
relative age (“3 months ago”) that is not a date. It lands when the review
export does.
