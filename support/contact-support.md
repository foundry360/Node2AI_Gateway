# Node2AI Enterprise Support

## Getting Help

### Support Channels

**Email Support:**

- General: support@foundry360.com
- Technical: tech-support@foundry360.com
- Licensing: licensing@foundry360.com

**Support Portal:**

- URL: https://support.node2ai.com
- Login with your license key

**Documentation:**

- Installation: [INSTALL.md](../INSTALL.md)
- Configuration: [CONFIGURATION.md](../CONFIGURATION.md)
- Troubleshooting: [docs/troubleshooting.md](../docs/troubleshooting.md)

### Support Tiers

**Enterprise Support:**

- 24/7 support
- 1-hour response time
- Priority bug fixes
- Dedicated support engineer

**Professional Support:**

- Business hours support
- 4-hour response time
- Standard bug fixes

**Community Support:**

- Documentation and forums
- Community assistance
- Self-service resources

## Before Contacting Support

1. **Check Documentation**: Review installation and troubleshooting guides
2. **Check Logs**: Review application logs for errors
3. **Run Health Checks**: Use `./scripts/health-check.sh`
4. **Gather Information**: Collect version, OS, and error details

## Information to Provide

When contacting support, please include:

1. **Version Information:**
   - Node2AI version
   - Operating system
   - Docker/Kubernetes version (if applicable)

2. **Error Details:**
   - Error messages
   - Log files
   - Steps to reproduce

3. **System Information:**
   - Hardware specifications
   - Network configuration
   - Deployment method (Docker/K8s/Standalone)

4. **Configuration:**
   - Environment variables (redact secrets)
   - Configuration files (redact secrets)

## Log Collection

### Docker Deployment

```bash
# Collect logs
docker-compose logs > node2ai-logs.txt

# Collect system info
docker info > docker-info.txt
docker-compose ps > docker-status.txt
```

### Kubernetes Deployment

```bash
# Collect logs
kubectl logs -n node2ai --all-containers=true > node2ai-logs.txt

# Collect cluster info
kubectl get all -n node2ai > k8s-status.txt
kubectl describe pods -n node2ai > k8s-pods.txt
```

### Standalone Deployment

```bash
# Collect logs
journalctl -u node2ai > node2ai-logs.txt

# Collect system info
systemctl status node2ai > systemd-status.txt
```

## Emergency Support

For critical production issues:

1. **Phone**: +1 (XXX) XXX-XXXX (Enterprise customers only)
2. **Email**: emergency@foundry360.com
3. **Support Portal**: Mark as "Critical" priority

## Feature Requests

Submit feature requests via:

- Support portal
- Email: product@foundry360.com
- GitHub Issues (if public repository)

## Bug Reports

Report bugs via:

- Support portal
- Email: bugs@foundry360.com

Include:

- Description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Log files and screenshots

## Training and Resources

- **Documentation**: Complete documentation in `docs/` directory
- **Video Tutorials**: Available in support portal
- **Webinars**: Monthly training webinars
- **On-site Training**: Available for Enterprise customers

## License and Billing

For license and billing inquiries:

- Email: licensing@foundry360.com
- Phone: +1 (XXX) XXX-XXXX

## Community

- **Forums**: https://community.node2ai.com
- **Slack**: https://node2ai.slack.com (invite via support portal)
- **Blog**: https://blog.node2ai.com

## Office Hours

**Support Hours:**

- Monday - Friday: 9:00 AM - 5:00 PM EST
- 24/7 available for Enterprise customers

**Holidays:**

- Major US holidays observed
- Emergency support available

---

**Foundry360**  
Node2AI Enterprise Support  
Email: support@foundry360.com  
Website: https://node2ai.com
