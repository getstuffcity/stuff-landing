import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import AdminBroadcastEmail from '@/components/emails/admin-broadcast-email';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const resend = new Resend(process.env.RESEND_KEY);

// This type should match the one in AdminForm.tsx
type ComponentDefinition = {
  id: number;
  type: 'text' | 'button' | 'image' | 'link';
  content: string;
  link?: string;
  preset?: 'claim' | 'referral';
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.isAdmin) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { subject, imageUrl, components, targetGroup, timeFilter, sendTestUser } = await request.json();

  try {
    // IMPORTANT: Fetch all columns needed for preset links
    let query = supabase.from('waitlist').select('email, first_name, claim_id, referral_id, created_at');

    // Add your filtering logic here if you bring back the targetGroup dropdown
    // ...
    if (targetGroup === 'claimed_username') {
      query = query.not('claimed_username', 'is', null);
    } else if (targetGroup === 'not_claimed_username') {
      query = query.is('claimed_username', null);
    } else if (targetGroup === 'not_referred_anyone') {
      // Step A: Get all IDs from the 'referred_by' column that are not null.
      // These are the IDs of the users who successfully referred someone.
      const { data: referrerIds, error: idsError } = await supabase
        .from('waitlist')
        .select('referred_by')
        .not('referred_by', 'is', null);

      if (idsError) throw new Error(`Supabase subquery error: ${idsError.message}`);

      // Extract the IDs into a simple array.
      const listOfReferrerIds = referrerIds.map(item => item.referred_by);

      if (listOfReferrerIds.length > 0) {
        // Step B: Find all users whose 'referral_id' is NOT IN the list of successful referrers.
        query = query.not('referral_id', 'in', `(${listOfReferrerIds.join(',')})`);
      }
      // If listOfReferrerIds is empty, it means no one has referred anyone yet,
      // so the query correctly fetches all users.
    }

    // --- NEW: Filter by Time (chained on top of the target group filter) ---
    if (timeFilter && timeFilter !== 'any') {
      console.log('using time filter')
      const daysAgo = parseInt(timeFilter, 10);
      if (!isNaN(daysAgo)) {
        // Calculate the cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

        // Add the time condition to the query.
        // '.lt()' means "less than", so created_at must be before the cutoff date.
        query = query.lt('created_at', cutoffDate.toISOString());
      }
    }

    const { data: users, error } = await query;

    if (error) throw new Error(`Supabase error: ${error.message}`);

    if (!users || users.length === 0) {
      return NextResponse.json({ message: 'No users found.' });
    }
    console.log("users", users)

    const tempUsers = [{
      email: '0naama0@gmail.com',
      first_name: 'Naama',
      claim_id: '40646a63-88e0-417b-8f78-d5267c3d129f',
      referral_id: '2c831572-6db3-4a92-a702-25ed07211002'
    },
    {
      email: 'dasuljung@gmail.com',
      first_name: 'Eunice',
      claim_id: '9cf0cf18-6738-48d7-b842-4ac08ffe6a0b',
      referral_id: '04fe3ffe-89ee-43fc-b87a-37d087b37239'
    }
    ]
    const userList = sendTestUser ? tempUsers : users;
    const totalUsers = userList.length;

    // Prepare batch of emails
    const emailBatch = userList.map(user => {
      if(!user.referral_id){
        console.log('no referral id')
      }
      // For each user, process the component definitions to create the final component list
      const processedComponents = (components as ComponentDefinition[])
        .map(comp => {
          if (comp.type === 'button' && comp.preset) {
            if (comp.preset === 'claim' && user.claim_id) {
              return { ...comp, link: `https://getstuff.city/claim/${user.claim_id}` };
            }
            if (comp.preset === 'referral' && user.referral_id) {
              return { ...comp, link: `https://getstuff.city/referral?ref=${user.referral_id}` };
            }
            return null;
          }
          if (comp.type === 'link') {
            return { ...comp, link: `https://getstuff.city/referral?ref=${user.referral_id}` };
          }
          return comp;
        })
        .filter(Boolean)
        .map(comp => {
          if (comp!.type === 'text') {
            const personalizedContent = comp!.content.replace(/{name}/g, user.first_name || 'there');
            return { ...comp, content: personalizedContent };
          }
          return comp;
        });

      return {
        from: 'STUFF <hello@getstuff.city>',
        to: user.email,
        subject: subject,
        react: AdminBroadcastEmail({
          subject,
          previewText: subject,
          processedComponents: processedComponents as any,
          imageUrl
        })
      };
    }); 
    // console.log("emailBatch", totalUsers, emailBatch)
    // Send all emails in batch
    const { data, error: batchError } = await resend.batch.send(emailBatch);

    if (batchError) {
      throw new Error(`Failed to send batch emails: ${batchError.message}`);
    }

    return NextResponse.json({ 
      message: `Successfully sent emails to ${userList.length} users.`,
      data: {
        totalSent: userList.length,
        batchData: data
      }
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ message: 'Failed to send emails.', error: error.message }, { status: 500 });
  }
}