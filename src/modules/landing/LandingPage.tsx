import { BrandMark, Link } from '@/app/components/AppChrome';
import { useServices } from '@/app/services';
import { templateById, templatePreview } from '@/modules/library/templates';
import { DesignSvg } from '@/modules/render/DesignSvg';
import { Icon } from '@/shared/ui/Icon';
import type { UiIconName } from '@/shared/ui/uiIcons';

const HERO = ['party-rooftop', 'birthday-thirty', 'conference-speaker'];

const FEATURES: readonly { icon: UiIconName; title: string; text: string }[] = [
  {
    icon: 'layers',
    title: 'A precise editor',
    text: 'Smart guides, snapping, alignment, multi-select, a clear layers panel, and a command palette for power users.',
  },
  {
    icon: 'download',
    title: 'Every format you need',
    text: 'Print-ready PDF, PNG with transparency, compact JPEG and true vector SVG, at up to 384 dpi.',
  },
  {
    icon: 'shield',
    title: 'Private by design',
    text: 'Designs and images are encrypted on your device with a key only your password (or recovery code) unlocks, before anything syncs.',
  },
  {
    icon: 'share',
    title: 'Share anywhere',
    text: 'Share a view-only link, send through your device’s share sheet, draft an email, or copy the image to the clipboard.',
  },
  {
    icon: 'cloud',
    title: 'Saves as you go',
    text: 'Every change saves instantly to this browser and syncs to your other devices in the background, with clear status at all times.',
  },
  {
    icon: 'palette',
    title: 'Make it yours',
    text: 'Light or dark, six accent colours, compact density and interface scaling.',
  },
];

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const { version, auth } = useServices();
  return (
    <div className="landing">
      <header className="landing__header">
        <Link to="/" aria-label="Canvas Studio home">
          <BrandMark />
        </Link>
        <nav className="landing__nav" aria-label="Main">
          {signedIn ? (
            <Link to="/projects" className="btn btn--primary btn--md">
              Open my projects
            </Link>
          ) : (
            <>
              <Link to="/sign-in" className="btn btn--ghost btn--md">
                Sign in
              </Link>
              <Link to="/sign-up" className="btn btn--primary btn--md">
                Create free account
              </Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <p className="eyebrow">
              <Icon name="sparkles" size={14} /> Canvas Studio 2
            </p>
            <h1 id="hero-title">
              Event graphics,
              <br />
              <span className="hero__accent">crafted like a pro.</span>
            </h1>
            <p className="hero__lead">
              Design posters, invitations, slides and social posts for every
              occasion, from a kid’s birthday to a 2,000-seat conference. Start
              from a template, make it yours, export print-ready files.
            </p>
            <div className="hero__actions">
              <Link
                to={signedIn ? '/projects' : '/sign-up'}
                className="btn btn--primary btn--lg"
              >
                {signedIn ? 'Open my projects' : 'Start designing — it’s free'}
              </Link>
              <Link to="/sandbox" className="btn btn--secondary btn--lg">
                <Icon name="sparkles" size={18} /> Try without an account
              </Link>
            </div>
            <p className="hero__note">
              <Icon name="info" size={14} /> The no-account sandbox works
              offline and saves nothing — export to keep your work.
            </p>
          </div>
          <div className="hero__visual" aria-hidden="true">
            {HERO.map((id, index) => {
              const template = templateById(id);
              return template ? (
                <div key={id} className={`hero__card hero__card--${index}`}>
                  <DesignSvg
                    document={templatePreview(template)}
                    assetUrls={{}}
                    className="fluid-svg"
                  />
                </div>
              ) : null;
            })}
          </div>
        </section>

        <section className="features" aria-labelledby="features-title">
          <h2 id="features-title">Everything a working designer expects</h2>
          <ul className="features__grid">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="feature">
                <span className="feature__icon">
                  <Icon name={feature.icon} size={20} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title">Your data</h2>
          <p>
            {auth.providerKind === 'local'
              ? 'Canvas Studio keeps your account and designs in this browser. Designs are encrypted at rest with a key derived from your password, and nothing is sent to a server.'
              : 'Your email and a password hash are stored by Supabase Auth in Sydney. Designs and images are encrypted in your browser before they sync to Supabase (Sydney), together with your encryption key wrapped by your password and recovery code, so the server can’t read your designs or images (it sees only what sync needs: ids, sizes and times). A design you share by link publishes its name and an image of it until you turn the link off. You can delete your account and all its data at any time.'}{' '}
            Interface preferences are kept in local storage. No analytics or
            tracking.
          </p>
        </section>
      </main>

      <footer className="landing__footer">
        <BrandMark compact />
        <span>Canvas Studio v{version}</span>
      </footer>
    </div>
  );
}
