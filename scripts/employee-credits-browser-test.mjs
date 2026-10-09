import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const browser=await chromium.launch();
const errors=[];
try {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  const employee={id:'local-manager',employee_code:'LOCAL',name:'Credits manager',position:'manager',active:true,is_owner:false,permissions:{credits:true,dashboard:true}};
  const data={settings:{referral_reward:50,referred_reward:100},authority:{allowed:true,whitelisted:false,daily_limit:4000,granted:0,remaining:4000},ledger:[],approvals:[],referrals:[{referred_email:'friend@example.com',referrer_email:'inviter@example.com',status:'qualified',reward_amount:50,referred_reward_amount:100,qualifying_order_id:'GM-LOCAL-001',created_at:'2026-10-01 09:00:00'}],leaderboard:[]};
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://glamiastore.com/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    let result={stats:{},orders:[],products:[],notifications:[]};
    if(path.endsWith('/auth/login')) result={token:'local-fixture-token',employee};
    else if(path.endsWith('/session')) result={employee};
    else if(path.endsWith('/credits/grants')) {
      const body=request.postDataJSON();assert.equal(body.email,'friend@example.com');assert.equal(body.amount,200);
      data.authority.granted=200;data.authority.remaining=3800;
      data.ledger=[{id:'local-grant',user_email:body.email,amount:body.amount,kind:'manual',description:body.reason,created_at:'2026-10-01 09:00:00',actor_email:'manager@example.com'}];result={ok:true};
    } else if(path.endsWith('/credits')) result=new URL(request.url()).searchParams.get('q')?{customers:[{email:'friend@example.com',name:'Local friend',balance:100}]}:data;
    await route.fulfill({json:result});
  });
  await page.goto('http://localhost:8082');
  await page.getByRole('textbox',{name:'Employee ID'}).fill('LOCAL');
  await page.getByLabel('Password',{exact:true}).fill('local-password');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByTestId('employee-more-open').click();
  await page.getByTestId('employee-more-screen').getByTestId('employee-workspace-credits').click();
  await expect(page.getByText('Give a customer credits',{exact:true})).toBeVisible();
  await page.getByLabel('Search registered customers').fill('friend');
  await page.getByRole('button',{name:/Local friend.*friend@example.com/}).click();
  await page.getByLabel('Credits to add').fill('200');
  await page.getByLabel('Grant reason').fill('Local app QA');
  await page.screenshot({path:'.wrangler/credits-bills-audit/qa/employee-credits.png',fullPage:true});
  await page.getByRole('button',{name:'Add store credits',exact:true}).click();
  await expect(page.getByText('Credits added. The transaction is saved in History.',{exact:true})).toBeAttached();
  await page.getByRole('button',{name:'Referrals',exact:true}).click();
  await expect(page.getByText('Reward both customers',{exact:true})).toBeVisible();
  await expect(page.getByText('₹100',{exact:true})).toBeVisible();
  await expect(page.getByText('₹50',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Adjust future rewards',exact:true})).toHaveCount(0);
  await page.screenshot({path:'.wrangler/credits-bills-audit/qa/employee-referrals.png',fullPage:true});
  await page.getByRole('button',{name:'History',exact:true}).click();
  await expect(page.getByText('Local app QA',{exact:true})).toBeAttached();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
  console.log('PASS employee credits grants/allowance/referral/history and manager restrictions');
} finally {await browser.close();}
