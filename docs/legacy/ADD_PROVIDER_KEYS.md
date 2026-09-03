# Add Provider API Keys - Enterprise Dashboard

## 🎯 Quick Access

1. Navigate to **Settings** (⚙️ icon in sidebar)
2. Click on **API Keys** tab
3. Scroll down to **Provider Keys** section

## 📋 Step-by-Step Guide

### Step 1: Open the Add Key Form

1. In the **Provider Keys** section, click the **"+ Add Provider Key"** button
2. A modal dialog will open

### Step 2: Fill in Provider Information

**Select Provider:**

- Choose from:
  - 🤖 **OpenAI** - GPT-4, GPT-3.5, DALL-E
  - 🧠 **Anthropic** - Claude-3, Claude-2
  - 🔍 **Google** - Gemini Pro, PaLM
  - 🌐 **Perplexity** - Perplexity AI

**Enter API Key:**

- Paste your provider API key
- Key is masked as you type (••••••••)

**Choose Environment:**

- Production
- Staging
- Development

**Add Description (Optional):**

- Add notes to remember what this key is for
- Example: "Main production key" or "Testing GPT-4"

### Step 3: Verify the Key

1. Click **"Verify Key"** button
2. System will:
   - Save the key (encrypted)
   - Make a test API call
   - Verify it works with your provider
3. You'll see one of these results:

**✅ Success:**

- Green checkmark
- Status message: "API key verified successfully!"
- Lists which capabilities work (chat, completions, embeddings)
- Can now click "Save Key"

**❌ Failure:**

- Red error message
- Details about what went wrong
- Option to fix and try again

### Step 4: Save the Key

1. If verification succeeded, click **"Save Key"**
2. Key is now saved and encrypted in the database
3. Dialog closes automatically
4. Key appears in your provider keys list

## 🔧 Managing Your Keys

### View All Keys

Scroll down to see all your saved keys:

- Provider icon and name
- Environment badge
- Status indicator
- Last tested date
- Action buttons

### Test Existing Keys

1. Find the key in the list
2. Click **"Test"** button
3. Status updates with latest test results
4. Helps monitor if keys are still working

### Delete Keys

1. Click **"Delete"** button on any key
2. Type **"DELETE"** to confirm
3. Key is permanently removed
4. Cannot be undone

## 🎨 UI Features

### Status Indicators

**🟢 Active**: Key is working and tested recently
**🟡 Untested**: Key hasn't been tested yet
**🔴 Failed**: Last test failed

### Environment Badges

- **Production** - Blue badge
- **Staging** - Yellow badge
- **Development** - Gray badge

### Security Features

- **Encryption**: All keys encrypted at rest with AES-256
- **Masking**: Keys shown as ••••••••
- **Verification**: Test keys before saving
- **Auth Required**: Only authenticated users can manage keys

## 📊 Key Statistics

At the top of the Provider Keys section, you'll see:

- **Total Keys**: How many keys you have
- **Active Keys**: Currently working keys
- **By Provider**: Count for each provider

## 🚨 Troubleshooting

### Key Verification Failed

**Common Issues:**

1. **Invalid Key**: Check the key is correct
2. **Wrong Provider**: Ensure key matches selected provider
3. **Rate Limits**: Provider may have rate limited you
4. **Network Issues**: Check your connection

**Solutions:**

- Double-check the API key in your provider dashboard
- Verify the key has correct permissions
- Try again after a few minutes
- Check provider status page

### Form Not Submitting

**Issues:**

- Missing required fields (Provider, API Key)
- Network error
- Authentication expired

**Solutions:**

- Ensure all required fields are filled
- Refresh the page
- Log out and log back in
- Check browser console for errors

### Can't See Your Keys

**Issues:**

- Keys belong to different organization
- Database connection issue
- Authentication problem

**Solutions:**

- Verify you're logged in to correct account
- Check organization ID matches
- Refresh the page
- Contact support

## 🔐 Security Best Practices

1. **One Key Per Environment**: Use separate keys for dev/staging/prod
2. **Descriptive Names**: Make it easy to identify each key
3. **Regular Testing**: Click Test periodically to verify keys work
4. **Delete Unused**: Remove keys you're no longer using
5. **Never Share**: Keep API keys private

## 🎯 Quick Start Example

Here's a complete example of adding an OpenAI key:

1. Go to Settings → API Keys
2. Scroll to Provider Keys section
3. Click "+ Add Provider Key"
4. Select "OpenAI" from provider dropdown
5. Paste your key: `sk-...`
6. Select "Production" environment
7. Add description: "Main production key"
8. Click "Verify Key"
9. Wait for green checkmark ✅
10. Click "Save Key"
11. Done! ✅

## 📍 Navigation Help

- **Settings Icon**: Top right corner (⚙️) or left sidebar
- **API Keys Tab**: Third tab in Settings
- **Provider Keys**: Bottom section of the page

## 💡 Pro Tips

- Test keys after adding to confirm they work
- Use different keys for different use cases
- Keep test results saved for troubleshooting
- Delete old keys to reduce clutter
- Check last tested date for key health

## 🆘 Need Help?

If you're having issues:

1. Check this guide
2. Review error messages in the UI
3. Check browser console (F12) for errors
4. Verify API keys are valid in provider dashboards
5. Contact support with details

Happy key managing! 🚀
