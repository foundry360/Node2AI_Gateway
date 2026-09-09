import { redirect } from 'next/navigation';

/** Preserve bookmarks; System now lives under Administration. */
export default function SystemRedirectPage() {
  redirect('/administration/system');
}
