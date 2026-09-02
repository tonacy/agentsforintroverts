/**
 * Act IV — Thursday, the playbook preview, and the capture. Placeholder.
 *
 * `page.tsx` already composes this act, so the task that fills it only ever
 * touches this file and a co-located `act-four.css`. Replace the whole body:
 * drop the inline `display: none`, build the scene with `ScrollScene` (see the
 * "Motion foundation" note), and keep the heading.
 *
 * Act I is holding two things that belong here until this act exists: the
 * payoff line "Thursday morning is still yours." and the `EmailForm` behind
 * the `#playbook` anchor. Moving them means editing `Hero.tsx` as well, so
 * that they are not duplicated on the page.
 */
export function ActFour() {
  return (
    <section
      id="act-four"
      aria-labelledby="act-four-title"
      style={{ display: "none" }}
    >
      <h2 id="act-four-title">Thursday</h2>
    </section>
  );
}
